# eve-central-jsTool

## Short Description

This tiny script allows you to show jump distance in eve-central market pages for each row, based on the location you specify
in a text box popup.

I was planning to have a caching mechanism but due to the 5 Mibi ```localStorage``` limit on most browser, it is thus quite
ineffective, except for the first system you type in.

It is then quite slow as each unique pair of source,destination triggers a new XHR query to eve-central.com API.

In a future version I plan compute the jump distance myself, using path finding and the jump data from ```data``` folder.

## To use this script

Go to any market page of https://eve-central.com/

then inject ```injector.js``` into the page, using this snippet (copy paste it into your browser console) : 
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
## Where does the data come from ?
 I took the data from https://github.com/theatrus/eve-central.com/tree/master/db 
 , imported it into a new postgresql database using docker, then exported all tables as json using SQL loop over a JSON export query, to obtain raw JSON-ish files.
 
 I added the ```[``` and ```]``` in each file to have a proper list of rows, and changed some variables names to matches what exists in eve-central API.
 
 I then used RegExpr replace to remove un-necessary information from the system lists and normalize the security status to a 0.0 style figure.
 
 I also used RegExpr replace to make a dict of system by Id and one by Names, so has to be able to quick search though it from Javascript
 
 I then processed the jump data using a small python script from ```data_indexer``` folder to make two dicts of jumps, one indexed and grouped by "from" (i.e. source system id) and the other by "to" (i.e. destination system id), so as to be able to eventually use them for path finding later-on.
 
### How to use this indexed_jumps.pyx ?
 As I was concerned that it would be slow-ish, I used Cython. Thus you have to compile the source first :
 
 ```bash
 cd data_indexer
 python setup.py build_ext --inplace
 chmod u+x run.py
```
 
And then run it :
```bash
./run.py
```
