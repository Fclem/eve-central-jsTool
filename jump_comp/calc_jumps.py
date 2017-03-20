#!/usr/bin/python
# -*- coding: utf-8 -*-
from __future__ import print_function
from time import sleep
import json
import numpy as np
import time
import inspect

prefix = 30000000
progress_settings = {
	'prefix': 'Progress:',
	'suffix': 'Complete',
	'length': 50
}

jump_from_file = 'data/jumps-by-from-id.json'
jump_to_file = 'data/jumps-by-to-id.json'
systems_file = 'data/systems-by-id.json'
write_to_file_name = 'jumps_calc.json'
index_cache = dict()

source_systems = dict()
source_data_to = dict()
source_data_from = dict()
jump_mat = None
from_list = list()
to_list = list()
system_list = list()

DEBUG = False


def debug_print(*msg):
	if DEBUG:
		print(msg)


class OriginOrDestinationNotFound(RuntimeError):
	pass


class JsonDataDoesNotMatchObjectFormat(RuntimeError):
	pass


class DescriptorAbstract(object):
	@staticmethod
	def transform(text):
		while text[-1] == '_':
			text = text[:-1]
		return text
	
	def __init__(self, some_json):
		"""
			Automatically loads JSON data into the object using existing class' attributes names as key
			JSON data must contain at least all the key that are defined as parent descriptor-class attributes.
			Attributes name starting with '_' are ignored, as well as functions and methods.
			Attributes names containing trailing '_' are processed without the trailing '_', however original attribute
				name is maintained. (this enables us of key names that are python reserved words, like 'from')
			Attributes must be set to their desired type (or an instance of) as data will be loaded into them using a
			new
				instance of their type. This enables the automatic parsing and building of a arborescent object
				structure

			:param some_json: data
			:type some_json: dict | list
		"""
		
		def value_predicate(value):
			return not (inspect.ismethod(value) or inspect.isfunction(value))
		
		def name_predicate(a_name):
			return not (a_name.startswith('_') or a_name in self.__class__.__dict__.keys())
		
		if not hasattr(self, '_required_keys'):
			self.__setattr__('_required_keys', [])
		for i in inspect.getmembers(self.__class__, value_predicate): # , value_predicate
			# Ignores anything starting with underscore
			# (that is, private and protected attributes)
			(name, obj) = i
			if name_predicate(name):
				# Ignores methods
				self._required_keys.append(name)
		debug_print(self.__class__.__name__, self._required_keys)
		try:
			if some_json and self.has_keys(some_json, self._required_keys):
				for each in self._required_keys:
					self.__custom_setattr__(each, some_json[self.transform(each)])
		except KeyError as e:
			raise JsonDataDoesNotMatchObjectFormat('key "%s" not found in %s' % (e.args[0], some_json))
	
	def __custom_setattr__(self, key, value):
		if not key.startswith('_'): # and key in self.__dict__.keys():
			default_val = self.__getattribute__(key) # attribute value, should be desired type, or an instance of it
			a_type = type(default_val) if type(default_val) is not type else default_val
			new_val = a_type(value) # loads the data value using type casting, useless for basic type, useful for class
		else:
			new_val = value
		self.__setattr__(key, new_val)
	
	@staticmethod
	def has_keys(a_dict, key_list, do_raise=True):
		assert isinstance(a_dict, dict)
		is_true = bool(a_dict) # the dictionary is not empty
		if is_true:
			for each in key_list:
				if DescriptorAbstract.transform(each) not in a_dict.keys():
					if do_raise:
						raise KeyError(each)
					else:
						return False
		return is_true


class SystemDescriptor(DescriptorAbstract):
	# "30004673": {"systemid":30004673,"name":"4Y-OBL","regionid":10000059,"security":-0.2}
	systemid = int
	name = unicode
	regionid = int
	security = float


class System(SystemDescriptor):
	def __str__(self):
		return '%s %s / %s' % (str(self.security), self.regionid, self.name)
	
	def short(self):
		return '%s %s' % (str(self.security), self.name)
	
	def __repr__(self):
		return '<System %s>' % self
	
	@property
	def gate_list(self):
		return JumpList(source_data_from[str(self.systemid)])

	def print_jump_list(self):
		for key, jump in self.gate_list.iteritems():
			print(jump)

	@staticmethod
	def get(system_id):
		if isinstance(system_id, System):
			return system_id
		return System(source_systems[str(system_id)])


class JumpDescriptor(DescriptorAbstract):
	"""
	 "30000003": {
        "30000001": {"fromconstellation": 20000001, "fromsystem": 30000003, "toregion": 10000001, "fromregion":
        10000001, "toconstellation": 20000001, "tosystem": 30000001},
        "30000052": {"fromconstellation": 20000001, "fromsystem": 30000003, "toregion": 10000001, "fromregion":
        10000001, "toconstellation": 20000008, "tosystem": 30000052},
        "30000084": {"fromconstellation": 20000001, "fromsystem": 30000003, "toregion": 10000001, "fromregion":
        10000001, "toconstellation": 20000012, "tosystem": 30000084},
        "30000007": {"fromconstellation": 20000001, "fromsystem": 30000003, "toregion": 10000001, "fromregion":
        10000001, "toconstellation": 20000001, "tosystem": 30000007}
    },
	"""
	fromconstellation = int
	fromsystem = int
	toregion = int
	fromregion = int
	toconstellation = int
	tosystem = int


class Jump(JumpDescriptor):
	@property
	def from_sys(self):
		return System.get(self.fromsystem)
	
	@property
	def to_sys(self):
		return System.get(self.tosystem)
	
	@property
	def from_str(self):
		return 'from %s' % str(self.from_sys)
	
	@property
	def to_str(self):
		return 'to   %s' % str(self.to_sys)
	
	def pp(self):
		return '%s\n%s' % (self.from_str, self.to_str)
	
	def __str__(self):
		return 'jump from %s to %s' % (str(self.from_sys), str(self.to_sys))
	
	def __repr__(self):
		return '<Jump %s>' % str(self).replace('\n', ' ')


class JumpList(object):
	_list = dict()
	from_sys = int
	
	def __init__(self, a_list, source=0):
		if source:
			final_source = source
		else:
			assert len(a_list)
			final_source = a_list.items()[0][1]['fromsystem']
		self.from_sys = System.get(final_source)
		for sys_id, sys in a_list.iteritems():
			self._list[int(sys_id)] = Jump(sys)
	
	def __iter__(self):
		return self._list.__iter__()

	def __getitem__(self, item):
		return self._list.get(item)
	
	def items(self):
		"""

		:rtype: list[(int, Jump)]
		"""
		return self._list.items()
	
	def iteritems(self):
		"""
		
		:rtype:  collections.Iterable[(int, Jump)]
		"""
		return self._list.iteritems()
	
	def __str__(self):
		return str(self._list)


def printProgressBar(iteration, total, prefix='', suffix='', decimals=1, length=100, fill='█'):
	"""
	Call in a loop to create terminal progress bar
	@params:
		iteration   - Required  : current iteration (Int)
		total       - Required  : total iterations (Int)
		prefix      - Optional  : prefix string (Str)
		suffix      - Optional  : suffix string (Str)
		decimals    - Optional  : positive number of decimals in percent complete (Int)
		length      - Optional  : character length of bar (Int)
		fill        - Optional  : bar fill character (Str)
	"""
	percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
	filled_length = int(length * iteration // total)
	bar = fill * filled_length + '-' * (length - filled_length)
	print('\r%s |%s| %s%% %s' % (prefix, bar, percent, suffix), end='\r')
	# Print New Line on Complete
	if iteration == total:
		print()


def get_json(file_name):
	return json.load(open(file_name))


def write_file(file_name, data):
	json.dump(data, open(file_name, 'w'), indent=4)
	print('saved %s' % file_name)
	return True


def make_index():
	global jump_from_file, jump_to_file, source_systems, source_data_to, source_data_from, jump_mat, from_list, to_list, system_list
	
	source_data_from = get_json(jump_from_file)
	from_list = source_data_from.keys()
	from_list.sort()
	
	source_data_to = get_json(jump_to_file)
	to_list = source_data_to.keys()
	to_list.sort()
	
	source_systems = get_json(systems_file)
	system_list = source_systems.keys()
	system_list.sort()
	
	# val_max = index_con(max(from_list)) + 1
	val_max = len(system_list)
	
	assert len(source_data_from) > 0 and len(source_data_to) > 0
	
	print(len(source_data_from), len(source_data_to), val_max)
	

def jump_distance(sys_a, sys_b):
	system_from = System.get(sys_a)
	system_to = System.get(sys_b)
	
	print('distance from %s (%s) to %s (%s)' % (system_from.name, system_from.systemid, system_to.name, system_to.systemid))
	print('Gates in %s :' % system_from.name)
	
	system_from.print_jump_list()
	
	for key, jump in system_from.gate_list.iteritems():
		pass
		# print(jump)
	
	print('%s :' % system_to.name)


def get_route(source, dest):
	assert isinstance(source, System) and isinstance(dest, System)


start = time.time()

make_index()
jump_distance(30000076, 30002510)

end = time.time()
print('done in %.2f sec' % (end - start))
