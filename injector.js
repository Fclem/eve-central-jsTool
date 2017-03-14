cache = localStorage;

matcher = /.+(?= [VIX]+)|[^\r\n ]+(?= .*)|^[^ ]+$/;

id_separator = '-';
route_prefix = 'R' + id_separator;
system_id_prefix = 'Sid' + id_separator;
system_name_prefix = 'Sna' + id_separator;
fetch = 0;
failed = 0;
pending = 0;
cached = 0;
total2 = 0;
last_pending = 0;
total = 0;

limited = true;
limit = 50;
refresh_int = 100;

source_system = 30002526;
base_system = 30000001;

route_url_base = '//api.eve-central.com/api/route/from/';

pend_res = {};

function sleep(time) {
	return new Promise((resolve) => setTimeout(resolve, time));
}

function system_info(system_id){
	var dest = base_system;
	if (system_id === undefined) {
		console.log('system_id is undefined');
		return [];
	}
	
	if(system_id === dest){
		dest++;
	}
	system_key = system_id_prefix + system_id;
	
	if(pend_res[system_key]){ // if resolution is pending
		while (!pend_res[system_key]) {
			sleep(500).then(() => {
					
				}
			)
		}
		return system_info(system_id);
	}else{
		if (!cache.getItem(system_key)) {
			pend_res[system_key] = true;
			
			full_url = route_url(system_id, dest);
			$.get(full_url, function (data, status) {
				if (status !== 'success') {
					console.log(status);
				}
				console.log('Q: system ' + system_id + ' is ' + name);
				cache.setItem(system_key, JSON.stringify(data[0].from));
				pend_res[system_key] = false
			}).fail(function () {
				console.log('res failed');
				pend_res[system_key] = false
			});
			return system_info(system_id);
		} else {
			pend_res[system_key] = false
			data = JSON.parse(cache.getItem(system_key));
			//console.log('system ' + system_id + ' is ' + data.name);
			return data;
		}
	}
}

function name_clean_url_sub(name, strip) {
		if(strip){
			name = name.match(/.+(?= [VIX]+)|[^\r\n ]+(?= .*)|^[^ ]+$/)[0]
		}
	return encodeURIComponent(name);
};

function name_clean_url(name){
	return name_clean_url_sub(name, false);
}

function name_clean_id_sub(name, strip) {
	return name_clean_url_sub(name, strip).replace(/%20/g, '_');
}

function name_clean_id(name) {
	return name_clean_id_sub(name, false);
};

function route_url(src, dest){
	return route_url_base + src + '/to/' + dest;
}

function set_item(data, store) {
	var key4 = '';
	var src;
	var dest;
	if (data[0] === undefined) {
		key4 = route_prefix + source_system + id_separator + source_system;
		data = [];
	} else {
		src = data[0].from;
		dest = data[data.length - 1].to;
		key4 = route_prefix + src.systemid + id_separator + dest.systemid;
		var src_sys_key = system_id_prefix + src.systemid;
		var dest_sys_key = system_id_prefix + dest.systemid;
		
		if(src !== undefined && !cache.getItem(src_sys_key))
			cache.setItem(src_sys_key, JSON.stringify(src));
		
		if(dest !== undefined && !cache.getItem(dest_sys_key))
			cache.setItem(dest_sys_key, JSON.stringify(dest));
		
		var src_name = system_info(src.systemid).name;
		var dest_name = system_info(dest.systemid).name;
		
		// console.log(src.systemid + ': ' + src_name + ' (' + src.name + '), ' + dest.systemid + ': ' + dest_name + ' (' + dest.name + ')');
		console.log(src.systemid + ': ' + src_name + ', ' + dest.systemid + ': ' + dest_name);
	}
	if (store) {
		console.log('caching ' + key4);
		cache.setItem(key4, JSON.stringify(data));
	}
	$('#' + key4).each(function (count) {
		// sys_name = system_name(source_system);
		str = ' (' + data.length + ' jumps from ' + src_name + ')';
		$(this).text(str);
	});
}

function getQueryVariable(variable, query) {
	//var query = window.location.search.substring(1);
	var vars = query.split('&');
	for (var i = 0; i < vars.length; i++) {
		var pair = vars[i].split('=');
		if (decodeURIComponent(pair[0]) == variable) {
			return decodeURIComponent(pair[1]);
		}
	}
	console.log('Query variable %s not found', variable);
}

function read_names() {
	var dest = '';
	var queries = {};
	$('span.sec_status').each(function (count) {
		total++;
		if(!limited || total <= limit){
			var parent = $(this).parent();
			dest = getQueryVariable('usesystem', parent.find('a.sslimit')[0].getAttribute('href'));
			// console.log(dest);
			var key1 = route_prefix + source_system + id_separator + dest;
			if (!parent.has('.custom_range_view').length) {
				obj = parent.append('  <span class="range_view custom_range_view" id="' + key1 + '"></span>');
			}
			queries[key1] = {from: source_system, to: dest, key: key1};
		}
	});
	
	for (key2 in queries) {
		total2++;
		var src = source_system;
		dest = queries[key2].to;
		var full_url = route_url(src, dest);
		var route_key = route_prefix + src + id_separator + dest;
		
		if (!cache.getItem(route_key)) {
			pending++;
			console.log('cache miss on ' + route_key);
			console.log('getting "' + full_url + '"');
			$.get(full_url, function (data, status) {
				if (status !== 'success') {
					console.log(status);
				}
				set_item(data, true);
				fetch++;
				pending--;
			}).fail(function () {
				console.log('failed');
				failed++;
				pending--;
			});
		} else {
			cached++;
			set_item(JSON.parse(cache.getItem(route_key)), false);
		}
	}
	last_pending = pending;
	console.debug(pending + ' pending queries')
	show_stats();
	
};

function show_stats(){
	if(pending > 0){
		if (last_pending !== pending){
			console.debug(pending + ' pending queries');
			last_pending = pending;
		}
		setTimeout(show_stats, 100);
	}else{
		var has_failed = ''
		if(failed > 0){
			has_failed = ' (' + failed + ' failed)'
		}
		cache_score = Number(( (cached / total2) * 100.).toFixed(2));
		console.debug(total2 + ' lookups, ' + fetch + ' queries' + has_failed + ', ' + cached + ' cached loads' +
		  ' (out of ' + total + ' items), ' + cache_score + '% cache hit')
	}
}
