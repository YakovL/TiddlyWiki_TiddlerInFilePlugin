/***
|Version|1.1|
***/
//{{{
config.macros.external = {
	fileFormats: {
		text: {
			extension: 'txt',
			externalize: function(tiddler) { return tiddler.text },
			// changes tiddler as a side-effect not to remove existing fields
			internalize: function(tiddler, source) {
				tiddler.text = source;
			}
		},
		externalized: {
			extension: 'tid.html',
			externalize: function(tiddler) {
				return store.getSaver().externalizeTiddler(store, tiddler);
			},
			// like for 'text', extends tiddler, doesn't create from scratch
			internalize: function(tiddler, source) {
				var div = createTiddlyElement(document.body, 'div');
				div.setAttribute('style','display:none;');
				div.innerHTML = externalizedText;
				store.getLoader().internalizeTiddler(store, tiddler,
					tiddler.title, div.firstChild);
				div.remove();
			}
		}/*,
		tid: { extension: 'tid' },
		json: { extension: 'tid.json' }
		externalizedWithFormatter? sane to implement?
		*/
	},
	// here and below "meta" means "info about registered external tiddler,
	// be it loaded or not"
	getExtension: function(meta) {
		const format = this.fileFormats[meta.fileFormat];
		if(!format) return; //# ok??
		return format.extension;
	},
	externalizeTiddler: function(meta) {
		const format = this.fileFormats[meta.fileFormat];
		if(!format) return; //# ok??
		return format.externalize(meta.tiddler);
	},
	internalizeTiddler: function(meta, source) {
		const format = this.fileFormats[meta.fileFormat];
		if(!format) return; //# ok??
		
		const tiddler = store.fetchTiddler(meta.tiddlerName) ||
			new Tiddler(meta.tiddlerName);
		format.internalize(tiddler, source); //# pass meta to tiddler?
		tiddler.doNotSave = function() { return !meta.keepInTW; };
		meta.tiddler = tiddler;
		
		return tiddler;
	},

	listName: "ExternalTiddlersList",
	// read files list, load
	init: function() {
		const listTiddler = store.fetchTiddler(this.listName);
		if(!listTiddler || !listTiddler.text) return;
		wikify(listTiddler.text, createTiddlyElement(null, 'div'));

		for(let meta of this.tiddlersMeta) this.loadExternal(meta);
	},
	handler: function(place, macroName, params, wikifier, paramString, tiddler) {
		// parse params, register
		const defaultParam = 'tiddler';
		const pParams = paramString.parseParams(defaultParam, null, true);
		const meta = {};
		meta.tiddlerName = getParam(pParams, defaultParam);
		if(!meta.tiddlerName) return;
		// although called .fileName, it actually can contain relative part of a path
		// fallback to meta.tiddlerName is set when calculating the full path
		meta.fileName = getParam(pParams, 'file', '');
		//# check if contains "bad" characters (like " or * ..for local paths only)
		meta.fileFormat = getParam(pParams, 'format', 'text');
		meta.isPlugin = getFlag(pParams, 'plugin'); //# allow just "plugin" instead of "plugin:true"?
		meta.keepInTW = getFlag(pParams, 'keepInternal'); //# ~
		this.registerExternal(meta);

		// visual feedback
		const macroText = wikifier.source.substring(wikifier.matchStart, wikifier.nextMatch);
		createTiddlyText(place, 'external ');
		createTiddlyLink(place, meta.tiddlerName, true);
		createTiddlyText(place, ' (');
		createTiddlyElement(place, 'code', '', '', macroText.slice(2 + macroName.length + 1, -2));
		createTiddlyText(place, ')');
	},
	// describes tiddlers registered as external, not necessarily loaded
	tiddlersMeta: [],
	registerExternal: function(meta) {
		//# check if already registered, don't register twice
		this.tiddlersMeta.push(meta);
	},
	getMetaFor: function(tiddlerOrTitle) {
		var isTitle = typeof tiddlerOrTitle == "string";
		for(meta of this.tiddlersMeta)
			if(isTitle && meta.tiddlerName == tiddlerOrTitle ||
			  !isTitle && meta.tiddler == tiddlerOrTitle)
				return meta;
	},
	loadExternal: function(meta) {
		// sync loading fails on startup because TF injects new mozillaLoadFile too late
//		var tiddlerText = loadFile(getLocalPath(getFullPath(meta.fileName)));
//		onExternalTiddlerLoad(tiddlerText !== null, meta, tiddlerText);
		// so we use async instead:
		let path = getFullPath(meta.fileName, meta.tiddlerName, this.getExtension(meta));
		httpReq("GET", path, this.onExternalTiddlerLoad, meta);
		//# rename onExternalTiddlerLoad into internalizeAndRegister?
	},
	onExternalTiddlerLoad: function(success, meta, responseText) {
		if(!success) return; //# notify somehow? may fail because file is not created yet or ...
		const tiddler = config.macros.external.internalizeTiddler(meta, responseText);
		store.addTiddler(tiddler);
		//# what if tiddler already exists?
		if(meta.isPlugin)
			eval(tiddler.text);
		//meta.lastLoaded = responseText;
	},
	saveExternal: function(meta, callback) {
		const fullPath = getFullPath(meta.fileName, meta.tiddlerName, this.getExtension(meta));
		// we don't try to save remote files (yet)
		if(!isLocalAbsolutePath(fullPath)) {
			//# if(callback) callback(.., '[saving remote is not supported]')
			return;
		}
		const localPath = getLocalPath(fullPath);

		const contentToSave = this.externalizeTiddler(meta);
		// save only if have something to save
		//if(contentToSave != meta.lastLoaded) {
			saveFile(localPath, contentToSave);
			//# get result of saving, return it
			//# or move externalizing into a separate helper?
		//	meta.lastLoaded = contentToSave;
			//# this assumes saving didn't fail, which may be wrong
		//}

		//# if(callback) callback(.., '[...]')
	},
	saveAll: function() {
		let overallSuccess = true;
		for(let meta of this.tiddlersMeta) {
			// a tiddler may got created after registration
			if(!meta.tiddler) {
				let tiddlerInStore = store.fetchTiddler(meta.tiddlerName);
				if(tiddlerInStore) {
					meta.tiddler = tiddlerInStore;
				} else
					// tiddler doesn't exist and we do nothing
					continue;
					//# based on config, we can show a warning instead
			}
			//# if(meta.tiddler.title != meta.tiddlerName)
			//  means tiddler got renamed → change meta.tiddlerName &
			//  update this.listName . If store contains another tiddler
			//  with that name, still keep the registered one?
			overallSuccess = this.saveExternal(meta) && overallSuccess;
			//# if saving failed, do something! (.oO dirty, notifying)
		}
		return overallSuccess;
	}
};

//# see implementations in STP (share to the core?)
function isAbsolutePath(path) {
	// covers http:, https:, file:, other schemas, windows paths (D:\...)
	if(/^\w+\:/.exec(path))
		return true;
	// unix absolute paths, starting with /
	if(/^\//.exec(path))
		return true;
	return false;
}
function isLocalAbsolutePath(path) {
	//# rename? we're going to check whether an absolute path is local, not path is absolute local
	return /^\w\:/.exec(path) || /^\//.exec(path) || /^file\:/.exec(path);
}
function getFullPath(subPath, nameFallback, extension) {
	const fileNamePosition = subPath.lastIndexOf('/') + 1;
	const fileName = subPath.substr(fileNamePosition);
	if(fileName && fileName.indexOf('.') == -1)
		subPath += '.' + extension;
	if(!fileName)
		subPath += nameFallback + '.' + extension;

	if(isAbsolutePath(subPath))
		return subPath;

	const url = window.location.toString();
	const base = url.substr(0, url.lastIndexOf('/') + 1);
	return base + subPath;
}

//# ideally, don't save main store if it were not changed
if(!config.macros.external.orig_saveChanges) {
	config.macros.external.orig_saveChanges = saveChanges;
	saveChanges = function(onlyIfDirty, tiddlers) {
		config.macros.external.saveAll();
		//# should we do smth about setDirty (if saving of a tiddler failed)?
		
		return config.macros.external.orig_saveChanges.apply(this, arguments);
	}
}

// hijack method of store (since not present in TiddlyWiki.prototype)
if(!config.macros.external.orig_deleteTiddler) {
	config.macros.external.orig_deleteTiddler = store.deleteTiddler;
	store.deleteTiddler = function(title) {
		var registeredMeta = config.macros.external.getMetaFor(title);
		if(registeredMeta) registeredMeta.tiddler = null;
		
		return config.macros.external.orig_deleteTiddler.apply(this, arguments);
	}
}
//}}}