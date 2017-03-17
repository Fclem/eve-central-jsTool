#!/usr/bin/python
# -*- coding: utf-8 -*-
from __future__ import print_function
from time import sleep
import json
import numpy as np
import time


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


def get_index(system, a_list):
	return a_list.index(system)
	# caching is actually 30% slower probably due to index lookup
	if system not in index_cache.keys():
		index_cache.update({system: a_list.index(system)})
	
	return index_cache[system]


def make_index(limit=-1):
	global jump_from_file, jump_to_file
	
	source_data_from = get_json(jump_from_file)
	from_list = source_data_from.keys()
	source_data_to = get_json(jump_to_file)
	to_list = source_data_to.keys()
	
	source_systems = get_json(systems_file)
	system_list = source_systems.keys()
	
	assert len(source_data_from) > 0 and len(source_data_to) > 0
	
	print(len(source_data_from), len(source_data_to))
	
	distance_mat = np.zeros((len(system_list), len(system_list)), dtype=np.int16)
	print(distance_mat.nbytes)
	
	# print(system_list, len(system_list))
	
	i, j = 0, 0
	for each_system in system_list:
		if each_system in from_list:
			# print(i, each_system, 'has %s jumps' % len(source_data_from[each_system]))
			for each_jump in source_data_from[each_system]:
				# print(each_jump)
				from_id = get_index(each_system, from_list)
				to_id = get_index(each_jump, from_list)
				# print('(%s) %s -> (%s) %s' % (from_id, each_system, to_id, each_jump))
				distance_mat[from_id, to_id] = 1
				
			j += 1
		i += 1
		if limit > 0 and j>= limit:
			break
	
	print(distance_mat[0:9, 0:9])
	
	print('%s systems, %s jumps' % (i, j))
	
	return distance_mat, source_data_from, source_data_to, from_list, to_list
	

start = time.time()

mat, dfrom, dto, flist, tlist = make_index()

end = time.time()
print('done in %.2f sec' % (end - start))


def old():
	index_from = { }
	index_to = { }
	lenght = len(source_data)
	
	print('index has %s jumps' % lenght)
	i = 0
	printProgressBar(i, lenght, **progress_settings)
	
	for each in source_data:
		from_key = each['fromsystem']
		to_key = each['tosystem']
		
		if from_key not in index_from.keys():
			index_from[from_key] = { }
		index_from[from_key].update({ to_key: each })
		
		if to_key not in index_to.keys():
			index_to[to_key] = { }
		index_to[to_key].update({ from_key: each })
		
		i += 1
		printProgressBar(i, lenght, **progress_settings)
	
	write_file(write_to_file_name % 'to', index_to)
	write_file(write_to_file_name % 'from', index_from)
