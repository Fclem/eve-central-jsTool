//var cache = {};
cache = localStorage;

function name_clean(name) {
	return encodeURIComponent(name.split(' ')[0]);
};

//source = 'Frarn VI';

source_system = 'Frarn';
route_url_base = '//api.eve-central.com/api/route/from/';

function route_url(src, dest){
	return route_url_base + src + '/to/' + dest;
}

function get_routeX(src, dest /*, callback */){
	var res;
	src = name_clean(src);
	dest = name_clean(dest);
	full_url = route_url(src, dest);
	route_key = src + '2' + dest
	
	console.debug(cache)
	
	function set_item(data, key4) {
		cache.setItem(key4, data);
		$('#' + key4).each(function (count) {
			str = ' (' + data.length + ' jumps from ' + source_system + ')'
			// console.debug('set ' + key4 + ' to ' + str)
			$(this).text(str)
		});
	}
	
	if(!cache.getItem(route_key)){
		a_key = route_key;
		$.get(full_url, function (data) {
			// console.log("Load was performed.");
			set_item(data, a_key);
			console.debug(data);
		});
	}else{
		// console.log("Load from cache");
		set_item(cache.getItem(route_key), route_key)
	}
}


function read_names() {
	var dest = '';
	var queries = {};
	var total = 0;
	$('span.sec_status').each(function (count) {
		total++;
		//if(count <=10){
			var parent = $(this).parent();
			dest = parent.text().split(/\r?\n/)[2].split(/-/)[0].split(/-?[01]\.[0-9] /)[1].trim();
			// dest = name_clean(dest);
			key1 = name_clean(source_system) + '2' + name_clean(dest);
			if(!parent.has('.custom_range_view').length){
				obj = parent.append('  <span class="range_view custom_range_view" id="' + key1 + '"></span>');
			}
			queries[key1] = {from: source_system, to: dest, key: key1};
		//}
	});
	console.debug(total + ' records');
	//console.debug(queries);
	var total2 = 0;
	var gets = 0;
	var cached = 0;
	for (key2 in queries) {
		total2++;
		// console.debug(queries[key2].from + ' to ' + queries[key2].to);
		src = name_clean(source_system);
		dest = name_clean(queries[key2].to);
		full_url = route_url(src, dest);
		route_key = src + '2' + dest;
		
		function set_item(data) {
			key4 = data[0].from.name + '2' + data[data.length-1].to.name;
			cache.setItem(key4, JSON.stringify(data));
			$('#' + key4).each(function (count) {
				str = ' (' + data.length + ' jumps from ' + source_system + ')'
				//console.debug('set ' + key4 + ' to ' + str)
				$(this).text(str)
			});
		}
		
		if (!cache.getItem(route_key)) {
			$.get(full_url, function (data) {
				// console.log("Load was performed.");
				set_item(data);
				gets++;
			});
		} else {
			// console.log("Load from cache");
			cached++;
			set_item(JSON.parse(cache.getItem(route_key)));
		}

	}
	console.debug(total2 + ' keys, ' + gets + ' gets, ' + cached + ' cached loads')
};
