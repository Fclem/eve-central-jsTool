# -*- coding: utf-8 -*-
from __future__ import print_function
from time import sleep
import json

progress_settings = {
	'prefix': 'Progress:',
	'suffix': 'Complete',
	'length': 50
}

source_data = dict()
read_from_file_name = 'jumps.json'
write_to_file_name = 'jumps_indexed_%s.json'


def printProgressBar(iteration, total, prefix = '', suffix = '', decimals = 1, length = 100, fill = '█'):
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


def get_json():
	return json.load(open(read_from_file_name))


def make_index():
	make_index_new()
	
	print('all done')

def write_file(file_name, data):
	json.dump(data, open(file_name, 'w'), indent=4)
	print('saved %s' % file_name)
	return True


def make_index_new():
	global write_to_file_name
	
	source_data = get_json()
	
	assert len(source_data) > 0
	
	index_from = {}
	index_to = {}
	lenght = len(source_data)
	
	print('index has %s jumps' % lenght)
	i = 0
	printProgressBar(i, lenght, **progress_settings)
	
	for each in source_data:
		from_key = each['fromsystem']
		to_key = each['tosystem']
		
		if from_key not in index_from.keys():
			index_from[from_key] = {}
		index_from[from_key].update({to_key: each})
		
		if to_key not in index_to.keys():
			index_to[to_key] = {}
		index_to[to_key].update({from_key: each})
		
		i += 1
		printProgressBar(i, lenght, **progress_settings)
	
	write_file(write_to_file_name % 'to', index_to)
	write_file(write_to_file_name % 'from', index_from)
