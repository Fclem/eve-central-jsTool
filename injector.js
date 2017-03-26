/*
	Author : Clément Fiere
	mail : Fclem@users.noreply.github.com
	date : 13/03/2017 - 16/03/2017, 26/03/2017
	all right reserved
 */

"use strict";

// UTILS
function getQueryVariable(variable, query) {
	/* returns a dict of query string components
	thanks to Tarik and katspaugh
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

function loadScript(url, callback) {
	// Adding the script tag to the head as suggested before
	// thanks to e-satis and joshuamabina
	// from http://stackoverflow.com/a/950146/5094389
	var head = document.getElementsByTagName('head')[0];
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = url;
	
	// Then bind the event to the callback function.
	// There are several events for cross browser compatibility.
	script.onreadystatechange = callback;
	script.onload = callback;
	
	// Fire the loading
	head.appendChild(script);
}

function loadCSS(url, cssId, callback){
	// thanks to user58777 and Martin Smith
	// from http://stackoverflow.com/a/577002/5094389
	if (!document.getElementById(cssId)) {
		var head = document.getElementsByTagName('head')[0];
		var link = document.createElement('link');
		link.id = cssId;
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.href = url;
		link.media = 'all';
		head.appendChild(link);
		console.info('imported ' + url);
		callback();
	}
}

/*
 ** Returns the caret (cursor) position of the specified text field.
 ** Return value range is 0-oField.value.length.
 * from http://stackoverflow.com/a/2897229
 */
function doGetCaretPosition(oField) {
	// Initialize
	var iCaretPos = 0;
	// IE Support
	if (document.selection) {
		// Set focus on the element
		oField.focus();
		// To get cursor position, get empty selection range
		var oSel = document.selection.createRange();
		// Move selection start to 0 position
		oSel.moveStart('character', -oField.value.length);
		// The caret position is selection length
		iCaretPos = oSel.text.length;
	}
	// Firefox support
	else if (oField.selectionStart || oField.selectionStart == '0')
		iCaretPos = oField.selectionStart;
	// Return results
	return iCaretPos;
}

// OWN SOURCES

// SETTINGS //
var jumpCalcMode = 'json';      // set to json for local distance comp, or xhr for http queries to eve-central
var debug = false;              // enables verbosity
var limited = false;            // enables the limitation of XHR queries to be issued
var limit = 50;                 // value of the limit
var refreshIntervalMs = 100;    // time to wait in milisecond between stats refresh
var progressBarRefreshMs = 25;  // update interval of the progress bar in miliseconds
var syncAjaxTimeOutMs = 10000;  // timout in miliseconds for synchronous XHR queries FIXME deprecated
var autocompleteSuggestNum = 5; // number of result to display in autocompletition suggestion (set to -1 to disable)
// END SETTING //

var cache = localStorage;
var ownCache = {};

var idSeparator = '-';
var routePrefix = 'R' + idSeparator;
var fetch = 0;
var computed = 0;
var failed = 0;
var pending = 0;
var cached = 0;
var total2 = 0;
var lastPending = 0;
var total = 0;
var progress = 0;
var t0 = 0;
var t1 = 0;
var cacheLimitExcedeed = false;

var sourceSystemId;
var running = false;
var canceled = false;

var routeUrlBase = '//api.eve-central.com/api/route/from/';
var resHostedUrlBase = 'https://rawgit.com/Fclem/eve-central-jsTool/master/';

var resSystemsIdUrl = 'data/systems-by-id.min.json';
var resSystemsNameUrl = 'data/systems-by-name.min.json';
var resRegionsUrl = 'data/regions-names-by-id.min.json';
var resJumpsFromUrl = 'data/jumps-by-from-id.min.json';
var resJumpsToUrl = 'data/jumps-by-to-id.min.json';
var selfUrl = 'injector.js';

function dynSetup(){
	resSystemsIdUrl = resHostedUrlBase + resSystemsIdUrl;
	resSystemsNameUrl = resHostedUrlBase + resSystemsNameUrl;
	resRegionsUrl = resHostedUrlBase + resRegionsUrl;
	resJumpsFromUrl = resHostedUrlBase + resJumpsFromUrl;
	resJumpsToUrl = resHostedUrlBase + resJumpsToUrl;
	selfUrl = resHostedUrlBase + selfUrl;
}

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
var uiTextBoxDefaultValue = "";
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
'.' + insertCustomClass + ' { text-align: right; }',
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
	width: calc(100% - 10px);
    height: calc(100% - 10px);
}`,
`#` + uiBoxCloseLink + `{
	bottom: 0;
	right: 5px;
	position: absolute;
	cursor: pointer;
	z-index: 12;
}`,
`#` + uiBoxCancelLinkId + `{
	bottom: 0;
	position: absolute;
	visibility: hidden;
	right: 50px;
    cursor: pointer;
    z-index: 12;
}`,
`#` + uiBoxLink + ` {
    color: white;
    cursor: pointer;
    z-index: 12;
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

function noop(){
	//does nothing
}

function setAutocomplete() {
	$('#' + uiTextBoxId).autocomplete({
		source: function (request, response){
			var results = systemLookupList(request.term);
			if(results.length === 1 && request.term === results[0])
				results = new Array();
			if(autocompleteSuggestNum > 0 && results.length > 0){
				results = results.slice(0, autocompleteSuggestNum);
			}
			response(results);
		}
	});
}

var scriptImport = [
	{url: 'https://code.jquery.com/jquery-1.12.4.js', callback: noop},
	{url: 'https://code.jquery.com/ui/1.12.1/jquery-ui.js', callback: setAutocomplete}
	
];

var cssImport = [
	{url: 'https://code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css', callback: noop}
];

function updateProgressBar() {
	if(debug) console.log(progressWidth);
	if (progressWidth >= 100) {
		progressDOM.style.width = '0%';
		progressDOM.style.visibility = 'hidden';
	} else {
		progressDOM.style.width = progressWidth + '%';
		setTimeout(updateProgressBar, progressBarRefreshMs);
	}
}

function progressInit() {
	progressDOM = document.getElementById("myBar");
	progressDOM.style.visibility = 'inherit';
	progressWidth = 0;
	setTimeout(updateProgressBar, progressBarRefreshMs);
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

function displayJumps(jumps, tagNameKey){
	var gen_text = Array(jumps + 1).join('#') + ' (<strong>' + jumps + '</strong> jp)';
	writeToTag(insertElTag + '[name=' + tagNameKey + ']', gen_text);
}

function setItem(data, store) {
	/* writes the number of jumps with a visual indication to every row that has the same destination system
	 * if store evals to true, store the jump data into cache */
	var src, dest, cache_key, tagNameKey, gen_text; // prevents eventual overwriting of external vars
	if (data[0] === undefined) {
		cache_key = routePrefix + sourceSystemId + idSeparator + sourceSystemId;
		tagNameKey = routePrefix + sourceSystemId;
		data = [];
	} else {
		src = data[0].from;
		dest = data[data.length - 1].to;
		cache_key = routePrefix + src.systemid + idSeparator + dest.systemid;
		tagNameKey = routePrefix + dest.systemid;
	}
	
	displayJumps(data.length, tagNameKey);
	
	if (store)
		write_cache(cache_key, data);
}

function clearUp(){
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
		  ', ', computed, ' computed (out of ', total, ' items), ', cache_score, '% cache hit');
		after();
	}
}

function updateProgressVal(){
	progressWidth = (progress / total2) * 100;
}

function showJumpCount(src){
	/* request (XHR or from cache) jump distance for each entry and display it in the new column */
	if(src === undefined) src = sourceSystemId;
	console.info('Source system is ', systemInfo(src).name);
	
	var queries = systemRowList;
	var maxItems = Object.keys(queries).length;
	
	for (var itemKey in queries) {
		if (limited && total2 >= limit) break;
		if (canceled) break;
		total2++;
		var dest = queries[itemKey].to;
		var full_url = route_url(src, dest);
		var route_key = routePrefix + src + idSeparator + dest;
		
		if (!cache.getItem(route_key)) {
			var fallBack = false;
			if(jumpCalcMode.toLowerCase() === 'json'){
				if (debug) console.log('name', routePrefix + dest);
				var distance = distance_calc(src, dest);
				if(distance > 0){
					computed++;
					progress++;
					displayJumps(distance, routePrefix + dest);
					updateProgressVal();
				}else
					fallBack = true;
			}
			if(fallBack || jumpCalcMode.toLowerCase() === 'xhr'){
				pending++;
				if (debug) {
					console.warn('cache miss on ', route_key);
					console.info('getting ', full_url);
				}
				resXHRlist.push($.get(full_url, function (data, status) {
					fetch++;
					progress++;
					pending--;
					if (status !== 'success'){
						console.error(status);
					}
					setItem(data, true);
					updateProgressVal();
				}).fail(function () {
					failed++;
					progress++;
					pending--;
					console.error('failed ', full_url);
					updateProgressVal();
				}));
			}
		} else {
			cached++;
			progress++;
			setItem(cache_get(route_key), false);
			updateProgressVal();
		}
	}
	lastPending = pending;
	console.log('', pending, ' pending queries');
	showStats();
};

function applyStyle(){
	/* Injects column style into document */
	var sheet = window.document.styleSheets[0]
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
	if (!Object.keys(resSystemsId).length){
		asyncGetCallback(resSystemsIdUrl, function (data){
			resSystemsId = data;
		});
	}
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
	computed = 0;
	progress = 0;
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
	t1 = performance.now();
	console.log("Done in " + (t1 - t0) + " milliseconds.");
}

function start(){
	t0 = performance.now();
	
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
			console.error(e);
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
	$('#' + uiTextBoxId).on('keydown', function (event) {
		if(event.keyCode >= 38 && event.keyCode <= 40) {
			
			var val = $(this).val().trim();
			var lookup = systemLookup(val);
			var carPos = doGetCaretPosition($(this)[0]);
			if (carPos === val.length && lookup !== '' &&
			  (event.keyCode === 9 || event.keyCode === 39 || event.keyCode === 13)) {
				$('#' + uiTextBoxId).val(lookup);
			}else{
				// prevents char sur-imposition effect while scrolling in the suggest list with arrow keys
				if (event.keyCode >= 38 && event.keyCode <= 40)
					$('#' + uiAutoBoxId).val('');
			}
		}
	});
	$('#' + uiTextBoxId).on('change paste input keyup', function (event) { //change
		if (debug) console.log(event);
		var val = $(this).val().trim();
		var lookup = systemLookup(val);
		var carPos = doGetCaretPosition($(this)[0]);
		if (false && carPos === val.length && lookup !== '' &&
		  (event.keyCode === 9 || event.keyCode === 39 || event.keyCode === 13)) {
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
	$('#' + uiBottomBox).remove();
	$('#' + uiBox).remove();
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

function attachCSS(){
	for (var each in cssImport)
		loadCSS(cssImport[each].url, 'injectedCSS' + each, cssImport[each].callback);
}

function subLoader(index){
	// synched chained script loader
	var url = scriptImport[index].url;
	loadScript(url, function () {
		console.info('imported ' + url);
		scriptImport[index].callback();
		if(++index < Object.keys(scriptImport).length){
			subLoader(index);
		}
	});
}

function attachScripts(){
	if(Object.keys(scriptImport).length > 0) subLoader(0);
}

function reloadSelf(){
	loadScript(selfUrl, function () {
		console.info('Realoaded self !');
		init();
	});
}

function init(){
	dynSetup();
	
	getSystems();
	attachCSS();
	
	applyStyle();
	insertBox();
	
	attachScripts();
	
	loadJumps();
}

var reachedCache = [];
var resJumpsFrom = [];

function loadJumps(){
	if (!Object.keys(resJumpsFrom).length) {
		asyncGetCallback(resJumpsFromUrl, function (data) {
			resJumpsFrom = data;
		});
	}
}

function distance_calc(from, to){
	reachedCache = [];
	
	function isDestination(localFrom){
		localFrom = Number(localFrom);
		//console.debug('local : ', localFrom, 'eq : ', from, localFrom === from, 'type', typeof localFrom, typeof from);
		return localFrom === to;
	}
	
	function jumpList(sysId){
		return Object.keys(resJumpsFrom[sysId]);
	}
	
	function distanceCalcSub(gate_list, depth) {
		var a_list = [];
		
		try {
			if(debug) console.log('gate_list :', gate_list);
			for (var each_i in gate_list) {
				var each = gate_list[each_i];
				if (debug) console.log('each ' + each);
				if (isDestination(each)) {
					throw EventException;
				}
				var gateList = jumpList(each);
				if (debug) console.log('gateList :', gateList);
				for (var gate_i in gateList) {
					var gate = gateList[gate_i];
					if (isDestination(gate)) {
						depth += 1;
						throw EventException;
					}
					if (!reachedCache.includes(gate)) {
						reachedCache.push(gate);
						a_list.push(gate);
					}
				}
			}
		} catch (e) {
			if (debug) console.log('found ' + e + ' ' + a_list);
			if (debug) console.log(each + ' ' + gate + ' ' + to);
			return depth;
		}
		if (a_list.length === 0) {
			if (debug) console.log('NOT FOUND');
			return -1;
		}
		return distanceCalcSub(a_list, depth + 1)
	}
	try{
		from = systemInfo(Number(from)).systemid;
		to = systemInfo(Number(to)).systemid;
	}catch(e){
		return -1;
	}
	
	var baseList = jumpList(from);
	if (debug) console.log('from ', from, 'to ', to);
	return distanceCalcSub(baseList, 0) + 1;
}


