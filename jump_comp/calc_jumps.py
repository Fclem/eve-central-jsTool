#!/usr/bin/python
# -*- coding: utf-8 -*-
from __future__ import print_function
import json
import time
import inspect
from enum import Enum
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
	
	def ioctl__g_w_i_n_s_z(file_desc):
		try:
			import fcntl
			import termios
			import struct
			cr = struct.unpack('hh', fcntl.ioctl(file_desc, termios.TIOCGWINSZ, '1234'))
		except:
			return
		return cr
	
	cr = ioctl__g_w_i_n_s_z(0) or ioctl__g_w_i_n_s_z(1) or ioctl__g_w_i_n_s_z(2)
	if not cr:
		try:
			fd = os.open(os.ctermid(), os.O_RDONLY)
			cr = ioctl__g_w_i_n_s_z(fd)
			os.close(fd)
		except:
			pass
	if not cr:
		cr = (env.get('LINES', TERM_FALLBACK_HEIGHT), env.get('COLUMNS', TERM_FALLBACK_WIDTH))
	
	return int(cr[1]), int(cr[0])


term_size = get_terminal_size()


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


class DestinationFound(GeneratorExit):
	pass


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
	name = str
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
		return source_data_from[str(self.systemid)]
	
	@property
	def gate_list(self):
		res = list(source_data_from[str(self.systemid)].keys())
		res.sort()
		return res
	
	@property
	def gate_list_int(self):
		a_list = CustomList()
		for each in self.gate_list:
			a_list.append(int(each))
		return a_list
	
	@property
	def gate_dict(self):
		a_list = dict()
		for each in self.gate_list:
			a_list.update({each: self.systemid})
		return a_list
	
	def gate_list_from(self, source_sys):
		source_sys = System.get(source_sys)
		result = self.gate_list_int
		key = int(source_sys.systemid)
		if key in result:
			result.remove(key)
		return result
	
	def print_jump_list(self):
		for key, jump in self.gate_list:
			print(jump)
	
	@staticmethod
	def get(system_id):
		"""
		:type system_id: int | str | System
		:rtype: System
		"""
		result = None
		if isinstance(system_id, System):
			system_key = system_id.systemid
			if system_key not in sys_cache.keys():
				sys_cache.update({system_key: result})
		else:
			try:
				system_key = int(system_id)
				if system_key not in sys_cache.keys():
					result = System(source_systems[str(system_key)])
					sys_cache.update({system_key: result})
			except ValueError:
				system_key = str(system_id)
				if system_key not in sys_cache.keys():
					result = System(source_systems_by_names[system_key])
					system_key = result.systemid
					sys_cache.update({system_key: result})
		return sys_cache[system_key]


class JumpDescriptor(DescriptorAbstract):
	fromconstellation = int
	fromsystem = int
	toregion = int
	fromregion = int
	toconstellation = int
	tosystem = int


class Jump(object):
	def __init__(self, sys_from, sys_to=None):
		assert isinstance(sys_from, JumpFromJson) or sys_from and sys_to and isinstance(sys_from, (int, str, System))
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
	
	def pretty_col(self, width: int = 10):
		return '%s -> %s' % (self.sys_from.name.ljust(width), self.sys_to.name.rjust(width))
	
	def pretty(self, width: int = 10):
		return '%s ->  %s' % (self.sys_from.name.ljust(width), self.sys_to.name)
	
	def __repr__(self):
		return '<Jump %s -> %s>' % (self.sys_from.name, self.sys_to.name)


class JumpFromJson(JumpDescriptor):
	@staticmethod
	def get(some_json):
		return Jump(JumpFromJson(some_json))


def print_progress_bar(iteration, total, prefix='', suffix='', decimals=1, length=100, fill='█'):
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
	global jump_from_file, jump_to_file, source_systems, source_data_to, \
		source_data_from, from_list, to_list, system_list, source_systems_by_names
	
	source_data_from = get_json(jump_from_file)
	from_list = list(source_data_from.keys())
	from_list.sort()
	
	source_data_to = get_json(jump_to_file)
	to_list = list(source_data_to.keys())
	to_list.sort()
	
	source_systems = get_json(systems_file)
	source_systems_by_names = get_json(systems_file_names)
	system_list = list(source_systems.keys())
	system_list.sort()
	
	val_max = len(system_list)
	
	assert len(source_data_from) > 0 and len(source_data_to) > 0
	
	if DEBUG:
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
	

class AlgorithmEnum(Enum):
	DFS = 0
	BFS = 1


class RouteCalc(object):
	DEFAULT_MAX_DEPTH = 90
	sys_from = None
	sys_to = None
	__reached = list()
	# __reach_list = list()
	__route = list()
	__selected_algorithm = None
	__safe_max_depth = 90
	
	default_algorithm_type = AlgorithmEnum.DFS
	
	def __init__(self, source, destination, algorithm: AlgorithmEnum = default_algorithm_type):
		self.sys_from = System.get(source)
		self.sys_to = System.get(destination)
		self.__selected_algorithm = algorithm
	
	def reach_pp(self):
		i = 0
		print("Accessible systems's id by depth from %s" % self.sys_from.name)
		if DEBUG: print('size %s' % len(self.reach_list))
		for each in self.reach_list:
			print('%03d' % i, each)
			i += 1
	
	@property
	def __algorithm_router(self):
		assert type(self.__selected_algorithm) is AlgorithmEnum
		dispatch = {AlgorithmEnum.DFS: self._gates_list_sub_DFS, AlgorithmEnum.BFS: self._gates_list_sub_BFS}
		return dispatch.get(self.__selected_algorithm, self._gates_list_sub_DFS)
	
	@property
	def reach_list(self):
		# if not self.__reach_list:
		# 	self.compute()
		# return self.__reach_list
		return list()
	
	@property
	def route_id_list(self):
		# if not self.__route:
		# 	self.compute()
		return self.__route
	
	@staticmethod
	def route_cache_pp(compact=False):
		size = len(list(route_cache.keys()))
		print('Route cache has %s items (means %s routes, plus reverse)' % (size, int(size / 2)))
		max_len = 0
		for key, jump_list in route_cache.items():
			max_len = max(max_len, len(System.get(key[0]).name), len(System.get(key[1]).name))
		
		for key, jump_list in route_cache.items():
			# print('%s -> %s %s:' % (System.get(key[0]).name, System.get(key[1]).name, key))
			print('%s -> %s:' % (System.get(key[0]).name, System.get(key[1]).name))
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
		return len(self.route_id_list)
	
	@property
	def __route_reversed(self):
		return list(self.__route.__reversed__())[1:] + [self.sys_from.systemid]
	
	def __cache_add(self):
		if self.route:
			route_cache.update({
				(self.sys_from.systemid, self.sys_to.systemid): self.route,
				(self.sys_to.systemid, self.sys_from.systemid): self.route_reversed
			})
			jump_distance_cache.update({
				(self.sys_from.systemid, self.sys_to.systemid): self.distance,
				(self.sys_to.systemid, self.sys_from.systemid): self.distance
			})
	
	def compute(self, max_depth=DEFAULT_MAX_DEPTH):
		self.__route = list()
		temp, found, found_depth = self.__algorithm_router(self.sys_from, max_depth)
		print('%s Route from %s to %s ' % (self.__selected_algorithm.name, self.sys_from.name, self.sys_to.name),
			end=' : ')
		if found:
			self.__cache_add()
			print('%s jumps (comp %s jump)' % (self.distance, found_depth))
		else:
			print('NOT FOUND (depth %s)' % max_depth)
	
	def _has_destination(self, a_list):
		for each in a_list:
			if self.sys_to.systemid in each:
				return True
		return False
	
	def _is_destination(self, sys):
		return int(sys) == self.sys_to.systemid or sys == self.sys_to
	
	# TODO
	def _gates_list_sub_BFS(self, source_sys, max_depth=DEFAULT_MAX_DEPTH, cur_depth=0):
		""" Breadth-first search style
		
		return the shortest route if possible within max_depth
		"""
		if not isinstance(source_sys, System):
			source_sys = System.get(source_sys)
		
		gate_list = source_sys.gate_dict
		
		self.__reached = list()
		level, rech = self.__next_level_gates(gate_list)
		if rech != source_sys.systemid:
			self.__route.insert(0, source_sys.systemid)
		
		return [], level != -1, level + 1
	
	def __next_level_gates(self, gate_list, depth=0):
		def stop_predicate():
			return depth >= self.__safe_max_depth - 1
		
		def printer(msg, offset=0, force=False, dead_end=False):
			if VERBOSE or force:
				MAX_DEF_CONST = ' #MAX_DEF#'
				DEAD_END_CONST = ' #DEAD_END#'
				max_str = MAX_DEF_CONST if stop_predicate() else ''
				line_str = '%03d %s' % (depth, '|  ' * (depth + offset) + '%s' % msg)
				dead_end_str = DEAD_END_CONST.rjust(len(MAX_DEF_CONST) + 2) if dead_end else ''
				sup_str = dead_end_str + max_str
				print(line_str.ljust(term_size[0] - len(dead_end_str)) + sup_str if sup_str else line_str)
		
		a_list = dict()
		f_append, f_parent = None, None
		
		if stop_predicate():
			printer('ROCK BOTTOM')
			return -1
		try:
			for each, source in gate_list.items():
				if self._is_destination(each):
					f_append, f_parent = each, source
					raise DestinationFound('l1-%s' % depth)
				new_gate_list = System.get(each).gate_list_int
				for gate in new_gate_list:
					if self._is_destination(gate):
						depth += 1
						f_append, f_parent = gate, each
						raise DestinationFound('l2-%s from %s' % (depth, (source, each, gate)))
					if gate not in self.__reached:
						self.__reached.append(gate)
						a_list.update({gate: each})
		except DestinationFound as e:
			printer('found (%s) : %s' % (e, a_list))
			if DEBUG:
				print(f_parent, f_append)
			self.__route.append(f_append)
			return depth, f_parent
		num, parent = self.__next_level_gates(a_list, depth + 1)
		self.__route.insert(0, parent)
		if DEBUG:
			print(a_list[parent], parent)
		return num, a_list[parent]
	
	# @new_thread
	def _gates_list_sub_DFS(self, source_sys, max_depth=DEFAULT_MAX_DEPTH, cur_depth=0, index=0, parent=None):
		""" Depth-First Search style
		
		i.e. return the longest route given a specific max_depth
		"""
		if not isinstance(source_sys, System):
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
		
		if source_sys.systemid in self.__reached:
			printer('skipped %s' % source_sys.systemid)
			return a_list, found, found_depth
		self.__reached.append(source_sys.systemid)
		
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
				reachable, found, found_depth = self._gates_list_sub_DFS(jump, max_depth, cur_depth + 1, cur_index,
					source_sys)
				if DEBUG:
					printer(reachable, 1)
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
	
	if DEBUG:
		print(
			'distance from %s (%s) to %s (%s)' % (source.name, source.systemid, destination.name,
			destination.systemid))
	
	res_route = RouteCalc(source, destination, AlgorithmEnum.BFS)
	res_route.compute(5)
	
	return res_route


load_data()

if __name__ == '__main__':
	start = time.time()
	route = get_route('Tidacha', 30000077)
	route = get_route('Tidacha', 'Rens')
	RouteCalc.route_cache_pp()
	end = time.time()
	print('done in %.2f sec' % (end - start))
