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
systems_file_names = 'data/systems-by-name.json'
write_to_file_name = 'jumps_calc.json'
index_cache = dict()

source_systems = dict()
source_systems_by_names = dict()
source_data_to = dict()
source_data_from = dict()
jump_mat = None
from_list = list()
to_list = list()
system_list = list()

DEBUG = False
VERBOSE = False

sys_cache = dict()


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
	def gate_list_details(self):
		return source_data_from[unicode(self.systemid)]
	
	@property
	def gate_list(self):
		return source_data_from[unicode(self.systemid)].keys()
	
	@property
	def gate_list_int(self):
		a_list = CustomList()
		for each in self.gate_list:
			a_list.append(int(each))
		return a_list

	def gate_list_from(self, source_sys):
		source_sys = System.get(source_sys)
		result = self.gate_list_int
		# print(result, source_sys.systemid)
		key = int(source_sys.systemid)
		if key in result:
			# print('removed %s' % source_sys.systemid)
			result.remove(key)
		return result

	def print_jump_list(self):
		for key, jump in self.gate_list.iteritems():
			print(jump)

	@staticmethod
	def get(system_id):
		"""
		:type system_id: int | unicode
		:rtype: System
		"""
		result = None
		if isinstance(system_id, System):
			system_key = system_id.systemid
			if system_key not in sys_cache.keys():
				sys_cache.update({ system_key: result })
		else:
			try:
				system_key = int(system_id)
				if system_key not in sys_cache.keys():
					result = System(source_systems[unicode(system_key)])
					sys_cache.update({ system_key: result})
			except ValueError:
				system_key = unicode(system_id)
				if system_key not in sys_cache.keys():
					result = System(source_systems_by_names[system_key])
					system_key = result.systemid
					sys_cache.update({ system_key: result })
		return sys_cache[system_key]


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
		# return 'jump from %s to %s' % (str(self.from_sys), str(self.to_sys))
		return '%s -> %s' % (self.from_sys.name, self.to_sys.name)
	
	def __repr__(self):
		return '<Jump %s -> %s>' % (self.from_sys.name, self.to_sys.name)


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


def load_data():
	global jump_from_file, jump_to_file, source_systems, source_data_to, source_data_from, jump_mat, from_list, to_list, system_list, source_systems_by_names
	
	source_data_from = get_json(jump_from_file)
	from_list = source_data_from.keys()
	from_list.sort()
	
	source_data_to = get_json(jump_to_file)
	to_list = source_data_to.keys()
	to_list.sort()
	
	source_systems = get_json(systems_file)
	source_systems_by_names = get_json(systems_file_names)
	system_list = source_systems.keys()
	system_list.sort()
	
	val_max = len(system_list)
	
	assert len(source_data_from) > 0 and len(source_data_to) > 0
	
	print(len(source_data_from), len(source_data_to), val_max)
	

class CustomList(list):
	def merge(self, other):
		assert isinstance(other, list)
		my_size = len(self)
		for each_index in range(max(my_size, len(other))):
			b = other[each_index] if each_index < len(other) else []
			if each_index < my_size:
				self[each_index] += b
			else:
				self.append(b)
	
	@staticmethod
	def merger(first, other):
		# print(type(first), type(other))
		assert type(first) in [list, CustomList]
		assert type(other) in [list, CustomList]
		
		return CustomList(first).merge(other)
		
		new_list = CustomList()
		for each_index in range(max(len(first), len(other))):
			a = first[each_index] if each_index < len(first) else []
			b = other[each_index] if each_index < len(other) else []
			# print(a, b)
			new_list.append(a + b)
		return new_list


class RouteCalc(object):
	sys_from = None
	sys_to = None
	reached = list()
	__reach_list = list()
	
	def __init__(self, source, destination):
		self.sys_from = System.get(source)
		self.sys_to = System.get(destination)
		
		print('Route calc from %s to %s' % (self.sys_from.name, self.sys_to.name))
	
	def pretty_print(self):
		i = 0
		if DEBUG: print('size %s' % len(self.reach_list))
		for each in self.reach_list:
			print(i, each)
			i += 1
	
	@property
	def reach_list(self):
		if not self.__reach_list:
			self.__reach_list = self.compute()
		return self.__reach_list
	
	def compute(self, max_depth=3):
		self.__reach_list, _ = self._gates_list_sub(self.sys_from, max_depth)
		return self.__reach_list

	def _has_destination(self, a_list):
		for each in a_list:
			if self.sys_to.systemid in each:
				return True
		return False
	
	def _is_destination(self, sys):
		return sys == self.sys_to.systemid or sys == self.sys_to

	def _gates_list_sub(self, source_sys, max_depth=90, cur_depth=0, index=0, parent=None):
		if not isinstance(source_sys, System) :
			source_sys = System.get(source_sys)
			
		def printer(msg, sup=0, force=False):
			if VERBOSE or force:
				print('%d %s' % (cur_depth, '  ' * (cur_depth + sup) + '%s' % msg))
		
		a_list, found = CustomList(), False
		
		if source_sys.systemid in self.reached:
			printer('skipped %s' % source_sys.systemid)
			return a_list, found
		self.reached.append(source_sys.systemid)
		
		gate_list = source_sys.gate_list_from(parent) if parent else source_sys.gate_list_int
		
		printer('%s from %s (%s) (%s gates : %s)' %
				(index, source_sys.name, source_sys.systemid, len(gate_list), gate_list))
		
		a_list, tmp_list = [gate_list], CustomList()
		
		if cur_depth < max_depth:
			cur_index = 0
			for jump in gate_list:
				# if self._has_destination([[jump]]):
				if self._is_destination(jump):
					printer('THIS IS IT')
				reachable, found = self._gates_list_sub(jump, max_depth, cur_depth + 1, cur_index, source_sys)
				if DEBUG: printer(reachable, 1)
				tmp_list.merge(reachable)
				if found:
					break
				cur_index += 1
		a_list += tmp_list
		return a_list, found


def get_route(source_var, destination_var):
	source, destination = System.get(source_var), System.get(destination_var)
	
	print('distance from %s (%s) to %s (%s)' % (source.name, source.systemid, destination.name, destination.systemid))
	
	route = RouteCalc(source, destination)
	route.compute(10)
	
	return route

start = time.time()

load_data()
route = get_route('Tidacha', 'Rens')
route.pretty_print()

end = time.time()
print('done in %.2f sec' % (end - start))
