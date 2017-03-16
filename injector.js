/*
	Author : clement@fiere.fr
	date : 13/03/2017 - 15/03/2017
 */

"use strict";

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

var sourceSystemId;
var limited = false;
var limit = 50;
var refreshIntervalMs = 100;
var syncAjaxTimeOutMs = 10000;
var running = false;
var canceled = false;

var routeUrlBase = '//api.eve-central.com/api/route/from/';
var resSystemsIdUrl = 'https://breeze-dev.cloudapp.net/pub/data/systems-by-id.json';
var resSystemsNameUrl = 'https://breeze-dev.cloudapp.net/pub/data/systems-by-name.json';
var resRegionsUrl = 'https://breeze-dev.cloudapp.net/pub/data/regions-names-by-id.json';
var resJumpsUrl = 'https://breeze-dev.cloudapp.net/pub/data/jumps-by-from-id.json';
var resSystemsId = {};
var resSystemsNames = {};
var systemRowList = {};
var resXHRlist = new Array();

var insertElTag = 'td';
var insertCustomClass = 'custom_range_view';
var insertDefaultClass = 'range_view';

var columnHeaderInsertSelector = 'th:first-child + th';
var uiJumpThClass = 'injected-jump-th';
var insertColumnHeaderHtml = '<th class="' + uiJumpThClass + '">Jumps</th>';

var uiTextBoxId = "injector-system-text";
var uiAutoBoxId = "injector-autocomplete";
var uiTextBoxDefaultValue = "Frarn";
var uiSubmitId = "injector-form";
var uiBox = "injector-box";
var uiBoxLink = "injector-box-opener";
var uiBottomBox = "injector-bottom-box";
var uiBoxCloseLink = 'injector-box-closer';
var uiBoxCancelLinkId = 'injector-box-cancel';

var uiBoxHTML = `
<div id="` + uiBox + `" class="floating-box">
	<div id="myBar"></div>
	<form action="#" id="` + uiSubmitId + `">
		<input type="text" id="` + uiTextBoxId + `" placeholder="Name of your current system" value="` + uiTextBoxDefaultValue + `" autocomplete="off">
        <input type="text" id="` + uiAutoBoxId + `" disabled="disabled" />
		<input type="submit" value="submit">
		<a id="` + uiBoxCancelLinkId + `">cancel</a>   <a id="` + uiBoxCloseLink + `">close</a>
	</form>
</div>
<div id="` + uiBottomBox + `" class="bottom-box">
	<a id="` + uiBoxLink + `"> Open </a>
</div>`

var uiBoxStyle = [
`.bottom-box{
	background-color: dimgrey;
    padding: 10px;
    border: 1px solid;
    border-bottom: 0px;
    border-color: #888;
    left: 10%;
    bottom: 0px;
    height: 20px;
    position: fixed;
    min-width: 20px;
}`,
`.floating-box{
	background-color: lightyellow;
    color: #eee;
    padding: 10px;
    border: 1px solid;
    border-color: #888;
    top: 50%;
    margin-top: -15px;
    left: 50%;
    margin-left: -200px;
    min-height: 30px;
    position: fixed;
    min-width: 200px;
    visibility: hidden;
}`,
`.floating-box form{
	background: transparent;
}`,
`#` + uiBox + ` input[type=text]{
	position: absolute;
    top: 0px;
    left: 0px;
	background: transparent;
	border: 0px;
	padding: 5px;
}`,
`#` + uiBoxCloseLink + `{
	bottom: 0;
	right: 5px;
	position: absolute;
	cursor: pointer;
}`,
`#` + uiBoxCancelLinkId + `{
	bottom: 0;
	position: absolute;
	visibility: hidden;
	right: 50px;
    cursor: pointer;
}`,
`#` + uiBoxLink + ` {
    color: white;
    cursor: pointer;
}
`,
`#` + uiAutoBoxId + `{
	z-index: 10;
}
`,
`#` + uiTextBoxId + `{
	z-index: 11;
}
`,
`#` + uiBox + ` input[type=submit]{
	display: none;
	visibility: hidden;
	right: 3px;
	top: 3px;
}
`,
`#myBar {
    width: 1%;
    visibility: hidden;
    position: absolute;
    z-index: 9;
    height: 100%;
    top: 0px;
    left: 0px;
    background-color: wheat;
}
`]


var previousInput = '';
var progressWidth = 0;
var progressDOM = '';

function updateProgressBar() {
	if(debug) console.log(progressWidth);
	if (progressWidth >= 100) {
		progressDOM.style.width = '0%';
		progressDOM.style.visibility = 'hidden';
	} else {
		progressDOM.style.width = progressWidth + '%';
		setTimeout(updateProgressBar, 10);
	}
}

function progressInit() {
	progressDOM = document.getElementById("myBar");
	progressDOM.style.visibility = 'inherit';
	progressWidth = 0;
	setTimeout(updateProgressBar, 10);
}

function write_cache(key, data, forceOverwrite){
	/* saves data to the localStorage cache with key as a JSON dump
	 * Only writes if key is not found in cache or if forceOverwrite evals to true
	 * FIXME somewhat broken */
	var pData = JSON.stringify(data);
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

function systemInfo(system){
	/* return a system object as found from the JSON data-source */
	if (system === undefined) {
		console.error('systemId is undefined');
		return [];
	}
	if(debug) console.log(typeof system);
	if(typeof system === "number"){
		return resSystemsId[system];
	}else{
		//system = system.substr(0,1).toUpperCase() + system.substr(1);
		return resSystemsNames[system];
	}
}

function systemLookup(sysName){
	if(sysName === '') return '';
	var keys = Object.keys(resSystemsNames);
	for(var each in keys){
		if(keys[each].toLowerCase().startsWith(sysName.toLowerCase())){
			return keys[each];
		}
	}
	return '';
}

function systemLookupList(sysName) {
	var keys = Object.keys(resSystemsNames);
	var res = new Array();
	for (var each in keys) {
		if (keys[each].toLowerCase().startsWith(sysName.toLowerCase())) {
			res.push(keys[each]);
		}
	}
	return res;
}

function route_url(src, dest){
	// returns the full relative url to query for jump data from src to dest
	return routeUrlBase + src + '/to/' + dest;
}

function writeToTag(tagSelector, data) {
	// writes `data` HTML to every `tagSelector` found in DOM
	 $(tagSelector).each(function () {
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

function clearUp(){
	/*
	var selection = $('.' + insertCustomClass);
	//if(selection.length > 0){
	for (var each = 0; each < selection.length; each++) {
		$(selection[each]).html('&nbsp;');
	}
	*/
	writeToTag('.' + insertCustomClass, '&nbsp;');
}

function getSystemsIdList() {
	/* get a dict of all listed systems from borh buy and sell orders tables', with no more than one entry per system
	 * also add the column to each row, to be later filled by showJumpCount() */
	var dest = '';
	var queries = {};
	var locatorSelector = 'span.sec_status';
	
	insertHeader();
	
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
	
	systemRowList = queries;
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
		var cache_score = Number(( (cached / total2) * 100.).toFixed(2));
		console.log('', total2, ' lookups, ', fetch, ' queries' + has_failed + ', ', cached, ' cached loads' +
		  ' (out of ', total, ' items), ', cache_score, '% cache hit');
		after();
	}
}

function updateProgressVal(){
	progressWidth = ((fetch + failed + cached) / total2) * 100;
}

function showJumpCount(src){
	/* request (XHR or from cache) jump distance for each entry and display it in the new column */
	console.info('Source system is ', systemInfo(sourceSystemId).name);
	
	var queries = systemRowList;
	var maxItems = Object.keys(queries).length;
	
	for (var itemKey in queries) {
		if (limited && total2 >= limit) break;
		if (canceled) break;
		total2++;
		// var src = sourceSystemId;
		var dest = queries[itemKey].to;
		var full_url = route_url(src, dest);
		var route_key = routePrefix + src + idSeparator + dest;
		
		if (!cache.getItem(route_key)) {
			pending++;
			if (debug){
				console.warn('cache miss on ', route_key);
				console.info('getting ', full_url);
			}
			resXHRlist.push($.get(full_url, function (data, status) {
				fetch++;
				pending--;
				if (status !== 'success') {
					console.error(status);
				}
				set_item(data, true);
				updateProgressVal();
				//progressWidth = ((fetch + failed + cached) / total2) * 100;
			}).fail(function () {
				failed++;
				pending--;
				console.error('failed ', full_url);
				updateProgressVal();
				//progressWidth = ((fetch + failed + cached) / total2) * 100;
			}));
		} else {
			cached++;
			set_item(cache_get(route_key), false);
			updateProgressVal();
			//progressWidth = ((fetch + failed + cached) / total2) * 100;
		}
	}
	lastPending = pending;
	console.log('', pending, ' pending queries');
	showStats();
};

function applyStyle(){
	/* Injects column style into document */
	var sheet = window.document.styleSheets[0]
	sheet.insertRule('.' + insertCustomClass + ' { text-align: right; }', sheet.cssRules.length);
	for(var each in uiBoxStyle){
		sheet.insertRule(uiBoxStyle[each], sheet.cssRules.length);
	}
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

function asyncGetCallback(url, callback) {
	/* Makes a proper "XHR" request, and call the callback on success */
	$.ajax({
		url     : url,
		type    : "GET",
		dataType: "json",
		timeout : syncAjaxTimeOutMs,
		success : callback
	});
}

function asyncGetRetVal(url, retVal) {
	/* Makes a proper "XHR" request, and store the result in retVal */
	$.ajax({
		url     : url,
		type    : "GET",
		dataType: "json",
		timeout : syncAjaxTimeOutMs,
		success : function (data) { retVal = data; }
	});
}

function getSystems(){
	/* Loads systems dictionary indexed by system id from a remtote JSON data source */
	// if (!Object.keys(resSystemsId).length) resSystemsId = syncGet(resSystemsIdUrl);
	if (!Object.keys(resSystemsId).length){
		asyncGetCallback(resSystemsIdUrl, function (data){
			resSystemsId = data;
		});
	}
	// if (!Object.keys(resSystemsNames).length) resSystemsNames = syncGet(resSystemsNameUrl);
	if (!Object.keys(resSystemsNames).length) {
		asyncGetCallback(resSystemsNameUrl, function (data) {
			resSystemsNames = data;
		});
	}
}

function setInputColor(color){
	$('#' + uiTextBoxId)[0].style.color = color;
}

function wrongInput(){
	setInputColor('red');
}

function before(){
	total2 = 0;
	pending = 0;
	fetch = 0;
	cached = 0;
	failed = 0;
	setInputColor('blue');
	$('#' + uiTextBoxId)[0].disabled = 'disabled';
	progressInit();
	canceled = false;
	$('#' + uiBoxCancelLinkId)[0].style.visibility = 'inherit';
	clearUp();
}

function after(){
	setInputColor('black');
	$('#' + uiBoxCancelLinkId)[0].style.visibility = 'hidden';
	$('#' + uiTextBoxId)[0].removeAttribute('disabled');
	$('#' + uiTextBoxId)[0].focus();
	running = false;
	canceled = false;
}

function start(){
	var systemName = $('#' + uiTextBoxId)[0].value.trim();
	
	if(systemName && !running){
		running = true;
		try{
			var system = systemInfo(systemName);
			if(debug) console.debug(system);
			sourceSystemId = Number(0 + system.systemid);
			if(sourceSystemId > 0){
				if (debug) console.log('system resolve says', system.name, ' : ', sourceSystemId);
				
				before();
				
				if (!Object.keys(systemRowList).length) {
					getSystemsIdList();
				}
				showJumpCount(sourceSystemId);
			}else{
				wrongInput();
			}
		}catch (e){
			after();
			wrongInput();
			console.error(e)
			console.warn('System', systemName, 'not found');
		}
	}
}

function mapEvents(){
	$('#' + uiBoxLink).click(function (event) {
		$('#' + uiBox)[0].style.visibility = 'visible';
		$('#' + uiBottomBox)[0].style.visibility = 'hidden';
		$('#' + uiTextBoxId)[0].focus();
	})
	$('#' + uiBoxCloseLink).click(function (event) {
		if(true || !running){
			$('#' + uiBox)[0].style.visibility = 'hidden';
			$('#' + uiBottomBox)[0].style.visibility = 'visible';
		}
	})
	$('#' + uiBoxCancelLinkId).click(function (event) {
		$('#' + uiBoxCancelLinkId)[0].style.visibility = 'hidden';
		canceled = true;
		for(var each in resXHRlist){
			resXHRlist[each].abort();
		}
		console.warn('OPERATION CANCELED');
	})
	$('#' + uiSubmitId).submit(function (event) {
		event.preventDefault();
		start();
	});
	$('#' + uiTextBoxId).on('change paste input keyup', function (event) { //keydown
		if (debug) console.log(event);
		var val = $(this).val().trim();
		var lookup = systemLookup(val);
		var lookupArray = systemLookupList(val);
		if (event.keyCode === 9 || event.keyCode === 39 || event.keyCode === 13) {
			$('#' + uiTextBoxId).val(lookup);
		}
		if(previousInput !== val){
			previousInput = val;
			if (lookup === val) {
				setInputColor('black');
			} else {
				if(lookup.toLowerCase().startsWith(val.toLowerCase()) && lookup !== ''){
					$('#' + uiTextBoxId).val(lookup.substr(0, val.length));
				}
				wrongInput();
			}
			if (!(event.keyCode === 9 || event.keyCode === 39 || event.keyCode === 13)) {
				$('#' + uiAutoBoxId).val(lookup);
			}
		}
	});
}

function insertBox(){
	$('body').append(uiBoxHTML);
	mapEvents();
}

function insertHeader(){
	if($('.' + uiJumpThClass).length === 0){
		$(columnHeaderInsertSelector).each(function () {
			$(this).after(insertColumnHeaderHtml);
		});
	}
}

function init(){
	getSystems();
	
	if(!initialized){
		applyStyle();
		insertBox();
		initialized = true;
	}
	
	// start();
}


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

function systemInfo(system_id, force_cache) {
	var dest = baseSystemId;
	if (system_id === undefined) {
		console.error('system_id is undefined');
		return [];
	}
	
	if (system_id === dest) {
		dest++;
	}
	var system_key = systemIdPrefix + system_id;
	
	return resSystemsId[system_id];
	
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
	 //return systemInfo(system_id);
	 return '?';
	 } else {
	 //pendRes[system_key] = false
	 data = cache_get(system_key);
	 return data;
	 }
	 
}
*/
