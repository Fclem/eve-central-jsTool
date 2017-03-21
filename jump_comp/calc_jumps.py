#!/usr/bin/python
# -*- coding: utf-8 -*-
from __future__ import print_function
from time import sleep
import json
import numpy as np
import time
import inspect
from threading import Thread

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

source_systems = dict()
source_systems_by_names = dict()
source_data_to = dict()
source_data_from = dict()
from_list = list()
to_list = list()
system_list = list()

DEBUG = False
VERBOSE = False

sys_cache = dict()
jump_distance_cache = dict()
route_cache = dict()
TERM_FALLBACK_WIDTH = 120
TERM_FALLBACK_HEIGHT = 25
MAX_SYS_NAME_LEN = 17


def get_terminal_size():
	import os
	env = os.environ
	
	def ioctl_GWINSZ(fd):
		try:
			import fcntl, termios, struct, os
			cr = struct.unpack('hh', fcntl.ioctl(fd, termios.TIOCGWINSZ,
				'1234'))
		except:
			return
		return cr
	
	cr = ioctl_GWINSZ(0) or ioctl_GWINSZ(1) or ioctl_GWINSZ(2)
	if not cr:
		try:
			fd = os.open(os.ctermid(), os.O_RDONLY)
			cr = ioctl_GWINSZ(fd)
			os.close(fd)
		except:
			pass
	if not cr:
		cr = (env.get('LINES', TERM_FALLBACK_HEIGHT), env.get('COLUMNS', TERM_FALLBACK_WIDTH))

	return int(cr[1]), int(cr[0])

term_size = get_terminal_size()


def max_system_name_len():
	# return len(max(source_systems_by_names.keys())) 8
	the_max = 0
	for each in source_systems_by_names.keys():
		the_max = max(the_max, len(each))
	return the_max


# clem 05/04/2016
def new_thread(func):
	""" Wrapper to run functions in a new Thread (use as a @decorator)

	:type func:
	:rtype:
	"""
	
	def decorated(*args):
		Thread(target=func, args=args).start()
	
	return None if not func else decorated


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


class Jump(object):
	def __init__(self, sys_from, sys_to=None):
		assert isinstance(sys_from, JumpFromJson) or sys_from and sys_to
		if isinstance(sys_from, JumpFromJson):
			self.sys_from = System.get(sys_from.fromsystem)
			self.sys_to = System.get(sys_from.tosystem)
		else:
			self.sys_from = System.get(sys_from)
			self.sys_to = System.get(sys_to)
	
	@property
	def from_str(self):
		return 'from %s' % str(self.sys_from)
	
	@property
	def to_str(self):
		return 'to   %s' % str(self.sys_to)
	
	def pp(self):
		return '%s\n%s' % (self.from_str, self.to_str)
	
	def __str__(self):
		# return 'jump from %s to %s' % (str(self.from_sys), str(self.to_sys))
		return '%s -> %s' % (self.sys_from.name, self.sys_to.name)
	
	def pretty_col(self, width=10):
		return '%s -> %s' % (self.sys_from.name.ljust(width), self.sys_to.name.rjust(width))
	
	def pretty(self, width=10):
		return '%s ->  %s' % (self.sys_from.name.ljust(width), self.sys_to.name)
	
	def __repr__(self):
		return '<Jump %s -> %s>' % (self.sys_from.name, self.sys_to.name)


class JumpFromJson(JumpDescriptor):
	@staticmethod
	def get(some_json):
		return Jump(JumpFromJson(some_json))


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
		assert type(first) in [list, CustomList]
		assert type(other) in [list, CustomList]
		
		return CustomList(first).merge(other)


class RouteCalc(object):
	DEFAULT_MAX_DEPTH = 90
	sys_from = None
	sys_to = None
	reached = list()
	__reach_list = list()
	__route = list()
	
	def __init__(self, source, destination):
		self.sys_from = System.get(source)
		self.sys_to = System.get(destination)
	
	def reach_pp(self):
		i = 0
		print("Accessible systems's id by depth from %s" % self.sys_from.name)
		if DEBUG: print('size %s' % len(self.reach_list))
		for each in self.reach_list:
			print('%03d' % i, each)
			i += 1
	
	@property
	def reach_list(self):
		if not self.__reach_list:
			self.compute()
		return self.__reach_list
	
	@property
	def route_id_list(self):
		if not self.__route:
			self.compute()
		return self.__route
	
	@staticmethod
	def route_cache_pp(compact=False):
		size = len(route_cache.keys())
		print('Route cache has %s items (means %s routes, plus reverse)' % (size, size / 2))
		max_len = 0
		for key, jump_list in route_cache.iteritems():
			max_len = max(max_len, len(System.get(key[0]).name), len(System.get(key[1]).name))
		
		for key, jump_list in route_cache.iteritems():
			print('%s -> %s %s:' % (System.get(key[0]).name, System.get(key[1]).name, key) )
			if compact:
				print('  %s' % jump_list)
			else:
				for each in jump_list:
					print('  %s' % each.pretty(max_len))
	
	def __jumpify(self, a_list, sys_from=None):
		if not sys_from:
			sys_from = self.sys_from
		new_list = list()
		if a_list:
			new_list.append(Jump(sys_from, a_list[0]))
			for each in range(len(a_list[:-1])):
				new_list.append(Jump(a_list[each], a_list[each + 1]))
		return new_list
	
	@property
	def route(self):
		return self.__jumpify(self.route_id_list)
	
	@property
	def route_reversed(self):
		return self.__jumpify(self.__route_reversed, self.sys_to)
	
	@property
	def distance(self):
		return len(self.route_id_list) - 1
	
	@property
	def __route_reversed(self):
		return list(self.__route.__reversed__())[1:] + [self.sys_from.systemid]
	
	def __cache_add(self):
		route_cache.update({
			(self.sys_from.systemid, self.sys_to.systemid): self.route,
			(self.sys_to.systemid, self.sys_from.systemid): self.route_reversed
		})
	
	def compute(self, max_depth=DEFAULT_MAX_DEPTH):
		print('Route calc from %s to %s' % (self.sys_from.name, self.sys_to.name), end=' : ')
		self.__route = list()
		temp, found, found_depth = self._gates_list_sub(self.sys_from, max_depth)
		if found:
			self.__reach_list = temp[0:found_depth]
			self.__cache_add()
			print('%s jumps' % self.distance)
		else:
			self.__reach_list = temp
			print('NOT FOUND (depth %s)' % max_depth)

	def _has_destination(self, a_list):
		for each in a_list:
			if self.sys_to.systemid in each:
				return True
		return False
	
	def _is_destination(self, sys):
		return sys == self.sys_to.systemid or sys == self.sys_to

	# @new_thread
	def _gates_list_sub(self, source_sys, max_depth=DEFAULT_MAX_DEPTH, cur_depth=0, index=0, parent=None):
		if not isinstance(source_sys, System) :
			source_sys = System.get(source_sys)
		if not parent:
			parent = self.sys_from
		
		def stop_predicate():
			return cur_depth > max_depth
		
		def printer(msg, sup=0, force=False, dead_end=False):
			if VERBOSE or force:
				MAX_DEF_CONST = ' #MAX_DEF#'
				DEAD_END_CONST = ' #DEAD_END#'
				max_str = MAX_DEF_CONST if stop_predicate() else ''
				line_str = '%03d %s' % (cur_depth, '|  ' * (cur_depth + sup) + '%s' % msg)
				dead_end_str = DEAD_END_CONST.rjust(len(MAX_DEF_CONST) + 2) if dead_end else ''
				sup_str = dead_end_str + max_str
				print(line_str.ljust(term_size[0] - len(dead_end_str)) + sup_str if sup_str else line_str)
		
		a_list, found, found_depth = CustomList(), False, -1
		
		if source_sys.systemid in self.reached:
			printer('skipped %s' % source_sys.systemid)
			return a_list, found, found_depth
		self.reached.append(source_sys.systemid)
		
		gate_list = source_sys.gate_list_from(parent) if parent else source_sys.gate_list_int
		
		line_str1 = '%s %s (%s)' % (index if cur_depth else '^', source_sys.name, source_sys.systemid)
		printer(line_str1, dead_end=len(gate_list) == 0)
		
		if not stop_predicate():
			if gate_list:
				printer('| %s has %s gates : (%s%s)' %
					(source_sys.name, len(gate_list) + 1, gate_list, ' + %s' % parent.name if parent else ''))
			
			a_list, tmp_list = [gate_list], CustomList()
			cur_index = 0
			for jump in gate_list:
				if self._is_destination(jump):
					found_depth = cur_depth
					printer('FOUND %s' % found_depth)
					found = True
					self.__route.append(jump)
					break
				reachable, found, found_depth = self._gates_list_sub(jump, max_depth, cur_depth + 1, cur_index, source_sys)
				if DEBUG: printer(reachable, 1)
				tmp_list.merge(reachable)
				if found:
					self.__route.insert(0, jump)
					printer('BACK %s' % found_depth)
					break
				cur_index += 1
			a_list += tmp_list
		return a_list, found, found_depth


def get_route(source_var, destination_var):
	source, destination = System.get(source_var), System.get(destination_var)
	
	print('distance from %s (%s) to %s (%s)' % (source.name, source.systemid, destination.name, destination.systemid))
	
	route = RouteCalc(source, destination)
	route.compute(15)
	
	return route


load_data()

if __name__ == '__main__':
	start = time.time()
	route = get_route('Tidacha', 'Rens')
	route.route_cache_pp()
	end = time.time()
	print('done in %.2f sec' % (end - start))
