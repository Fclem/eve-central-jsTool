cache = localStorage;

matcher = /.+(?= [VIX]+)|[^\r\n ]+(?= .*)|^[^ ]+$/;

var id_separator = '-'
var fetch = 0;
var failed = 0;
var pending = 0;
var cached = 0;
var total2 = 0;
var last_pending = 0;
var total = 0;

var limited = true;
var limit = 50;

source_system = 'Frarn';
route_url_base = '//api.eve-central.com/api/route/from/';

function name_clean_url_sub(name, strip) {
	// return encodeURIComponent(name.split(/( [VIX]?)+/)[0]);
	//try{
		if(strip){
			name = name.match(/.+(?= [VIX]+)|[^\r\n ]+(?= .*)|^[^ ]+$/)[0]
		}
	//} catch (e) {
	//	console.log(e.toString() + ' for ' + name);
	//}
	return encodeURIComponent(name);
};

function name_clean_url(name){
	return name_clean_url_sub(name, false);
}

function name_clean_id_sub(name, strip) {
	return name_clean_url_sub(name, strip).replace(/%20/g, '_');
}

function name_clean_id(name) {
	// return encodeURIComponent(name.match(/.+(?= [VIX]+)|[^\r\n ]+(?= .*)/)[0].replace(/%20/g, '_');
	return name_clean_id_sub(name, false);
};

function route_url(src, dest){
	return route_url_base + src + '/to/' + dest;
}

function set_item(data, store) {
	if (data[0] === undefined) {
		key4 = source_system + '2' + source_system;
		data = [];
	} else {
		key4 = name_clean_id(data[0].from.name) + '2' + name_clean_id(data[data.length - 1].to.name);
	}
	if (store) {
		console.log('caching ' + key4);
		cache.setItem(key4, JSON.stringify(data));
	}
	$('#' + key4).each(function (count) {
		str = ' (' + data.length + ' jumps from ' + source_system + ')'
		$(this).text(str)
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
			dest = parent.text().split(/\r?\n/)[2].split(/ - /)[0].split(/-?[01]\.[0-9] /)[1].trim();
			dest_code = getQueryVariable('usesystem', parent.find('a.sslimit')[0].getAttribute('href'));
			console.log(dest_code);
			key1 = name_clean_id(source_system) + id_separator + name_clean_id_sub(dest, true);
			if (!parent.has('.custom_range_view').length) {
				obj = parent.append('  <span class="range_view custom_range_view" id="' + key1 + '"></span>');
			}
			queries[key1] = {from: source_system, to: dest, key: key1};
		}
	});
	
	for (key2 in queries) {
		total2++;
		src = name_clean_url(source_system);
		dest = name_clean_url_sub(queries[key2].to, true);
		full_url = route_url(src, dest);
		
		src = name_clean_id(source_system);
		dest = name_clean_id_sub(queries[key2].to, true);
		route_key = src + id_separator + dest;
		
		if (!cache.getItem(route_key)) {
			pending++;
			console.log('cache miss on ' + route_key);
			console.log('getting "' + full_url + '"');
			console.log(queries[key2].to + ' => ' + name_clean_url_sub(queries[key2].to, true));
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
