# eve-central-jsTool

## Short Description

This tiny script allows you to show jump distance in eve-central market pages for each row, based on the location you specify
in a text box popup.

I was planning to have a caching mecanism but due to the 5Mibi ```localStorage``` limit on most browser, it is thus quite
innefective, except for the first system you type in.

It is then quite slow as each unique pair of source,destination triggers a new XHR query to eve-central.com API.

In a future version I plan compute the jump distance myself, using path finding and the jump data from ```data``` folder.

## To use this script

Go to any market page of https://eve-central.com/

then inject ```injector.js``` into the page, using this snipet (copy paste it into your browser console) : 
```javascript
// if you want to host this repo yourself, change this url and preserve folder structure.
// if you use a webserver, you will need to enable CORS by setting this HTTP header :
// Access-Control-Allow-Origin: *
var _resHostedUrlBase = 'https://rawgit.com/Fclem/eve-central-jsTool/master/';
var baseURL = _resHostedUrlBase + 'injector.js';

function loadScript(url, callback)
{
    // Adding the script tag to the head as suggested before
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

function doLoad(){
    loadScript(baseURL, function (){
        resHostedUrlBase = _resHostedUrlBase;
        init();
    });
}
doLoad();
```
