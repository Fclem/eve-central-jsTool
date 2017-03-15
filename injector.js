/*
	Author : clement@fiere.fr
	date : 13/03/2017 - 15/03/2017
 */

// UTILS
function getQueryVariable(variable, query) {
	/* returns a dict of query string components
	 originaly from https://stackoverflow.com/a/2091331/5094389
	 */
	var vars = query.split('&');
	for (var i = 0; i < vars.length; i++) {
		var pair = vars[i].split('=');
		if (decodeURIComponent(pair[0]) == variable) {
			return decodeURIComponent(pair[1]);
		}
	}
	console.log('Query variable %s not found', variable);
}

// OWN SOURCES
var cache = localStorage;
var ownCache = {};

var idSeparator = '-';
var routePrefix = 'R' + idSeparator;
//var systemIdPrefix = 'Sid' + idSeparator;
//var system_name_prefix = 'Sna' + idSeparator;
var fetch = 0;
var failed = 0;
var pending = 0;
var cached = 0;
var total2 = 0;
var lastPending = 0;
var total = 0;
var cacheLimitExcedeed = false;
var debug = false;

var initialized;

var limited = false;
var limit = 50;
var refreshIntervalMs = 100;
var syncAjaxTimeOutMs = 10000;

var sourceSystemId = 30002526;
var baseSystemId = 30000001;

var routeUrlBase = '//api.eve-central.com/api/route/from/';
var resSystemsUrl = 'https://breeze-dev.cloudapp.net/pub/data/systems-by-id.json';
var resRegionsUrl = 'https://breeze-dev.cloudapp.net/pub/data/regions-names-by-id.json';
var resJumpsUrl = 'https://breeze-dev.cloudapp.net/pub/data/jumps-by-from-id.json';
var resSystems = {};

var insertElTag = 'td';
var insertCustomClass = 'custom_range_view';
var insertDefaultClass = 'range_view';

var columnHeaderInsertSelector = 'th:first-child + th';
var insertColumnHeaderHtml = '<th>Jumps</th>';

function write_cache(key, data, forceOverwrite){
	/* saves data to the localStorage cache with key as a JSON dump
	 * Only writes if key is not found in cache or if forceOverwrite evals to true
	 * FIXME somewhat broken */
	pData = JSON.stringify(data);
	ownCache[key] = pData;
	if (!cacheLimitExcedeed) {
		if (!cache.getItem(key) || forceOverwrite !== undefined){
			try {
				cache.setItem(key, pData);
				if (debug) console.info('cached ', key);
			} catch (e) {
				cacheLimitExcedeed = true;
				console.error('Could not cache item ', key, ' because ', e);
			}
		}
	}else{
		if (debug) console.warn('Not caching ', key , ', because cache is full');
	}
}

function cache_get(key){
	/* return an object fetched from cache and converted back from JSON string
	return an empty Array if key is not found in cache
	 * FIXME somewhat broken */
	var data = [];
	data = ownCache[key];
	if(!data){
		try {
			data = cache.getItem(key);
		} catch (e2) {
			console.warn('', key, ' not found in any cache because ', e2);
		}
	}
	return JSON.parse(data);
}

function system_info(systemId, force_cache){
	/* return a system object as found from the JSON data-source */
	var dest = baseSystemId;
	if (systemId === undefined) {
		console.error('systemId is undefined');
		return [];
	}
	if(systemId === dest) dest++;
	
	return resSystems[systemId];
}

function route_url(src, dest){
	// returns the full relative url to query for jump data from src to dest
	return routeUrlBase + src + '/to/' + dest;
}

function writeToTag(tagSelector, data){
	// writes `data` HTML to every `tagSelector` found in DOM
	$(tagSelector).each(function (count) {
		$(this).html(data);
	});
}

function set_item(data, store) {
	/* writes the number of jumps with a visual indication to every row that has the same destination system
	 * if store evals to true, store the jump data into cache */
	var src, dest, cache_key, tag_name_key, gen_text; // prevents eventual overwritting of external vars
	if (data[0] === undefined) {
		cache_key = routePrefix + sourceSystemId + idSeparator + sourceSystemId;
		tag_name_key = routePrefix + sourceSystemId;
		data = [];
	} else {
		src = data[0].from;
		dest = data[data.length - 1].to;
		cache_key = routePrefix + src.systemid + idSeparator + dest.systemid;
		tag_name_key = routePrefix + dest.systemid;
	}
	
	gen_text = Array(data.length + 1).join('#') + ' (<strong>' + data.length + '</strong> jp)';
	writeToTag(insertElTag + '[name=' + tag_name_key + ']', gen_text);
	
	if (store)
		write_cache(cache_key, data);
}

function getSystemsIdList() {
	/* get a dict of all listed systems from borh buy and sell orders tables', with no more than one entry per system
	 * also add the column to each row, to be later filled by showJumpCount() */
	var dest = '';
	var queries = {};
	var locatorSelector = 'span.sec_status';
	
	writeToTag('.' + insertCustomClass, '');
	
	$(locatorSelector).each(function (count) {
		total++;
		var parent = $(this).parent();
		dest = getQueryVariable('usesystem', parent.find('a.sslimit')[0].getAttribute('href'));
		var cache_key = routePrefix + sourceSystemId + idSeparator + dest;
		var tag_name_key = routePrefix + dest;
		if (!parent.parent().has('.' + insertCustomClass).length) {
			parent.after('<' + insertElTag + ' class="' + insertDefaultClass + ' ' + insertCustomClass + '" name="' + tag_name_key + '"></' + insertElTag + '>');
		}
		queries[cache_key] = {from: sourceSystemId, to: dest, key: cache_key};
	});
	
	return queries;
}

function showStats() {
	/* displays remaining pending queries and wait for all of them to complete before displaying stats */
	if (pending > 0) {
		if (lastPending !== pending) {
			if (debug) console.log('', pending, ' pending queries');
			lastPending = pending;
		}
		setTimeout(showStats, refreshIntervalMs);
	} else {
		var has_failed = ''
		if (failed > 0) {
			has_failed = ' (' + failed + ' failed)'
		}
		cache_score = Number(( (cached / total2) * 100.).toFixed(2));
		console.log('', total2, ' lookups, ', fetch, ' queries' + has_failed + ', ', cached, ' cached loads' +
		  ' (out of ', total, ' items), ', cache_score, '% cache hit');
	}
}

function showJumpCount(queries){
	/* request (XHR or from cache) jump distance for each entry and display it in the new column */
	for (item_key in queries) {
		if (limited && total2 >= limit) {
			break;
		}
		total2++;
		var src = sourceSystemId;
		dest = queries[item_key].to;
		var full_url = route_url(src, dest);
		var route_key = routePrefix + src + idSeparator + dest;
		
		if (!cache.getItem(route_key)) {
			pending++;
			if (debug){
				console.warn('cache miss on ', route_key);
				console.info('getting ', full_url);
			}
			$.get(full_url, function (data, status) {
				fetch++;
				pending--;
				if (status !== 'success') {
					console.error(status);
				}
				set_item(data, true);
			}).fail(function () {
				failed++;
				pending--;
				console.error('failed ', full_url);
			});
		} else {
			cached++;
			set_item(cache_get(route_key), false);
		}
	}
	lastPending = pending;
	console.log('', pending, ' pending queries')
	showStats();
};

function applyStyle(){
	/* Injects column style into document */
	var sheet = window.document.styleSheets[0]
	sheet.insertRule('.' + insertCustomClass + ' { text-align: right; }', sheet.cssRules.length);
}

function syncGet(url){
	/* Makes a synchronous "XHR" request, and return its resulting data */
	var ret_data;
	$.ajax({
		url     : url,
		type    : "GET",
		dataType: "json",
		timeout : syncAjaxTimeOutMs,
		async   : false,
		success : function (data) { ret_data = data ; }
	});
	return ret_data;
}

function getSystems(){
	/* Loads systems dictionary indexed by system id from a remtote JSON data source */
	resSystems = syncGet(resSystemsUrl);
}

function init(){
	getSystems();
	
	console.info('Source system is ', system_info(sourceSystemId).name);
	pendRes = {};
	
	if(!initialized){
		$(columnHeaderInsertSelector).each(function () {
			$(this).after(insertColumnHeaderHtml);
		});
		initialized = true;
		applyStyle();
	}
	showJumpCount(getSystemsIdList());
}

/*
var elem = `<style>
	.tota11y-toolbar {
		background-color: #333 !important;
		color: #f2f2f2 !important;
		position: fixed !important;
		top: auto !important;
		right: auto !important;
		bottom: 0 !important;
		left: 10px !important;
		border-top-left-radius: 5px !important;
		border-top-right-radius: 5px !important;
		overflow: hidden !important;
		z-index: 9998 !important;
	}
	.tota11y, .tota11y * {
		border: none!important;
		background-color: inherit!important;
		box-sizing: border-box!important;
		color: #f2f2f2!important;
		font-family: Arial!important;
		font-size: 14px!important;
		font-style: normal!important;
		font-weight: 400!important;
		line-height: 1.35!important;
		margin: 0!important;
		padding: 0!important;
		text-align: left!important;
		text-shadow: none!important;
	}
</style>

<div id="tota11y-toolbar" class="tota11y tota11y-toolbar" role="region" aria-expanded="false">
	<div class="tota11y-toolbar-body">

	</div>
	<button aria-controls="tota11y-toolbar" class="tota11y-toolbar-toggle" aria-label="[tota11y] Toggle menu">
		<div aria-hidden="true" class="tota11y-toolbar-logo"><!--
    "Glasses" icon by Kyle Scott
    https://thenounproject.com/Kyle/

    Licensed under Creative Commons by 3.0 US
    http://creativecommons.org/licenses/by/3.0/us/legalcode
-->
			<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve">
    <path fill="#ffffff" d="M74.466,35.24c-1.069-0.19-2.208-0.267-3.228-0.562c-0.639-0.184-1.348-0.622-1.965-1.075  c-1.246-0.919-2.479-1.557-3.928-2.152c-0.671-0.276-1.617-0.698-2.432-0.608c-0.582,0.064-1.196,0.664-1.73,1.029  c-1.196,0.818-2.186,1.442-3.32,2.198c-0.524,0.35-1.308,0.798-1.543,1.263c-0.142,0.279-0.13,0.736-0.281,1.029  c-0.35,0.679-1.069,1.434-1.777,1.403c-0.835-0.038-1.773-1.518-1.449-2.619c0.177-0.602,1.126-0.902,1.776-1.262  c2.041-1.134,3.803-2.3,5.52-3.602c1.106-0.841,2.579-1.471,4.536-1.542c1.889-0.071,4.45-0.083,6.22,0  c1.465,0.066,2.698,0.164,3.976,0.42c7.308,1.469,14.698,2.788,21.607,4.77c0.739,0.213,2.896,0.613,3.086,1.311  c0.121,0.439-0.236,1.435-0.375,2.151c-0.165,0.865-0.292,1.626-0.42,2.246c-0.12,0.574-0.65,1.174-0.936,1.776  c-0.842,1.778-1.379,3.821-2.104,5.753c-0.954,2.545-2.02,4.859-3.554,6.968c-1.46,2.005-3.442,3.33-5.987,4.536  c-1.128,0.534-2.43,1.083-3.835,1.403c-1.355,0.311-3.263,0.63-4.817,0.28c-2.233-0.501-3.081-2.543-3.882-4.536  c-0.848-2.115-1.351-4.049-1.636-6.827c-2.692,0.176-3.259,2.014-4.163,3.928c-0.384,0.812-0.792,1.623-1.168,2.385  c-1.542,3.115-3.197,6.47-5.473,8.746c-1.215,1.213-2.581,2.03-4.35,2.758c-3.331,1.373-6.847,2.569-10.757,3.462  c-3.598,0.821-8.923,1.642-12.252-0.093c-2.136-1.113-3.105-3.939-4.023-6.268c-0.458-1.159-0.835-2.459-1.262-3.882  c-0.378-1.259-0.708-2.778-1.543-3.602c-1.053-1.037-2.78-1.414-3.227-2.993c-0.815-0.307-1.563-0.821-2.292-1.308  c-4.349-2.915-8.693-5.774-13.141-8.606c-0.727-0.462-1.667-0.958-2.151-1.497c-0.712-0.792-1.108-2.117-1.684-3.133  c-0.265-0.469-0.588-0.92-0.888-1.357c-0.275-0.4-0.536-0.997-1.076-1.076C2.223,36.823,2.365,37.469,2.349,38  c-0.017,0.549-0.077,1.172-0.047,1.823c0.028,0.606,0.297,1.049,0.28,1.544c-0.018,0.515-0.291,1.036-0.841,1.029  c-0.727-0.009-0.8-0.98-0.983-1.686c-0.209-0.807-0.483-1.551-0.421-2.245c0.049-0.531,0.341-1.223,0.468-2.057  c0.246-1.599,0.126-3.078,1.451-3.415C3.004,32.804,4,33.38,4.781,33.649c0.789,0.272,1.597,0.428,2.339,0.702  c0.854,0.316,1.706,0.875,2.524,1.355c2.526,1.484,4.626,3.112,7.062,4.63c3.273,2.041,6.545,3.955,9.307,6.267  c7.434-2.179,16.722-3.566,25.863-4.302c4.176-0.337,8.326-0.174,12.253,0.374c5.624,0.787,10.073-1.58,13.844-3.18  c2.035-0.864,4.078-1.653,6.173-2.573C80.804,36.331,77.705,35.814,74.466,35.24z M93.968,39.729  c-1.838-0.388-3.732-0.737-5.471-1.075c-0.059-0.012-0.127-0.067-0.188-0.046c-1.143,0.392-2.279,0.613-3.367,1.029  c-2.033,0.773-4.015,1.775-5.752,3.039C78.33,43.3,77.372,44,76.897,44.733c-1.609,2.489-1.206,7.214-0.467,10.149  c0.27,1.071,0.411,1.79,0.889,2.666c3.022,1.287,6.88-0.183,8.885-1.684c1.526-1.142,2.676-2.75,3.602-4.35  C91.815,48.042,93.102,43.946,93.968,39.729z M64.878,46.089c-6.121-1.937-14.865-0.822-21.232,0.467  c-4.477,0.907-9.474,1.92-10.944,5.753c-0.801,2.086-1.009,5.098-0.701,7.903c0.284,2.599,1.076,4.892,2.011,6.594  c2.943,2.698,10.038,1.581,14.124,0.375c2.523-0.745,4.112-1.389,5.845-2.197c1.973-0.921,4.636-1.939,5.285-4.116  c0.179-0.597,0.115-1.244,0.188-1.824c0.492-3.909,1.942-7.447,4.303-9.634c0.477-0.441,1.146-0.679,1.357-1.262  C65.37,47.428,65.13,46.709,64.878,46.089z"></path>
</svg>
		</div>
	</button>
</div>`;
*/

/*
# FIXME deprecated

 function cache_get_or_query(key, callable, url){ // TODO finish
 if (!cache.getItem(key)){
 write_cache(key, callable(url))
 }
 return cache_get(key);
 }
 
 function sleep(time) {
 return new Promise((resolve) => setTimeout(resolve, time));
 }
*/

/*

# FIXME old version

function system_info(system_id, force_cache) {
	var dest = baseSystemId;
	if (system_id === undefined) {
		console.error('system_id is undefined');
		return [];
	}
	
	if (system_id === dest) {
		dest++;
	}
	var system_key = systemIdPrefix + system_id;
	
	return resSystems[system_id];
	
	 if(force_cache !== undefined)
	 write_cache(system_key, force_cache);
	 
	 if (!cache.getItem(system_key)) {
	 //pendRes[system_key] = true;
	 
	 full_url = route_url(system_id, dest);
	 $.get(full_url, function (data, status) {
	 if (status !== 'success') {
	 console.warn(status);
	 }
	 console.log('Q: system ', system_id, ' is ', name);
	 //pendRes[system_key] = false
	 write_cache(system_key, data[0].from);
	 }).fail(function () {
	 //pendRes[system_key] = false
	 console.error('failed at ', full_url);
	 });
	 //return system_info(system_id);
	 return '?';
	 } else {
	 //pendRes[system_key] = false
	 data = cache_get(system_key);
	 return data;
	 }
	 
}
*/
