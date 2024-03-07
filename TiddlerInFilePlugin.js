/***
|Description |Allows to store any number of tiddlers as external files and more|
|Source      |https://github.com/YakovL/TiddlyWiki_TiddlerInFilePlugin/blob/master/TiddlerInFilePlugin.js|
|Author      |Yakov Litvin|
|Version     |1.1.3|
|License     |[[MIT|https://github.com/YakovL/TiddlyWiki_YL_ExtensionsCollection/blob/master/Common%20License%20(MIT)]]|
!!!Usage
Once the plugin is installed (copy - tag {{{systemConfig}}} - reload) storing tiddlers in files is done via 2 steps:
# list (describe) those in [[ExternalTiddlersList]] by writing {{{<<external>>}}} macros there
# if the file exists and the tiddler doesn't, reload TW (external tiddler will be loaded on startup);<br>if the tiddler exists and the file doesn't, just save your TW

Here's how the macro is used:
{{{
<<external [[MyTestTiddler]]>>
}}}
will store the tiddler's text in {{{MyTestTiddler.txt}}} in the same folder as TW. There's a number of other options:
{{{
<<external [[tiddler name]]
  [file:<relative path with or without filename and extension>]
  [format:{externalized | text}]
  [keepInternal:true]
  [plugin:true]
>>
}}}
Examples of the {{{file}}} param usage:
* {{{<<external [[MyTestTiddler]] file:"other name">>}}} makes file name different from tiddler name
* {{{<<external [[MyPlugin]] file:"MyPlugin.js" plugin:true>>}}} sets a custom file extension (see also the {{{plugin}}} option below)
* {{{<<external [[MyLog]] file:"../logs/">>}}} will store the file in another folder (note that omitted filename after {{{/}}} means "use tiddler name as filename and default extension")
* the plugin doesn't take care of forbidden characters yet ({{{*}}}, {{{?}}}, {{{"}}} etc), so be careful about those

Supported formats are
* {{{text}}} (default) – only tiddler text is stored in the file with {{{.txt}}} extension; and
* {{{externalized}}} – whole tiddler is stored in the same format as in TW store, file has {{{.tid.html}}} extension and is displayed is monospace tiddler text when opened in browser
Formats can be added by extending {{{config.macros.external.fileFormats}}}.

The {{{keepInternal}}} option makes TW save the tiddler in both external file and TW itself. This, for instance, affects tiddlers stored in {{{text}}} format: without it, all fields like creator, modified etc are destroyed on reload (since are not saved), but with it they are preserved.

The {{{plugin}}} option makes TW evaluate the tiddler like it does with plugins. Note that it doesn't handle plugin dependencies yet. @@color:red;Warning@@: TIFP doesn't currently take care of installing only once, so use {{{plugin}}} with {{{keepInternal}}} ''only'' if you understand the outcome (for instance, some plugins may create infinite loops; also remember that internal version will be always installed first).
***/
//{{{
config.macros.external = {
	fileFormats: {
		text: {
			extension: 'txt',
			externalize: function(tiddler) { return tiddler.text },
			// changes tiddler as a side-effect not to remove existing fields
			internalize: function(tiddler, source) {
				tiddler.text = source
			}
		},
		externalized: {
			extension: 'tid.html',
			externalize: function(tiddler) {
				return store.getSaver().externalizeTiddler(store, tiddler)
			},
			// like for 'text', extends tiddler, doesn't create from scratch
			internalize: function(tiddler, source) {
				var div = createTiddlyElement(document.body, 'div')
				div.setAttribute('style','display:none;')
				div.innerHTML = source
				store.getLoader().internalizeTiddler(store, tiddler,
					tiddler.title, div.firstChild)
				div.remove()
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
		const format = this.fileFormats[meta.fileFormat]
		if(!format) return //# ok??
		return format.extension
	},
	externalizeTiddler: function(meta) {
		const format = this.fileFormats[meta.fileFormat]
		if(!format) return //# ok??
		return format.externalize(meta.tiddler)
	},
	internalizeTiddler: function(meta, source) {
		const format = this.fileFormats[meta.fileFormat]
		if(!format) return //# ok??
		
		const tiddler = store.fetchTiddler(meta.tiddlerName) ||
			new Tiddler(meta.tiddlerName)
		format.internalize(tiddler, source) //# pass meta to tiddler?
		tiddler.doNotSave = function() { return !meta.keepInTW }
		meta.tiddler = tiddler
		
		return tiddler
	},

	listName: "ExternalTiddlersList",
	// read files list, load
	init: function() {
		const listTiddler = store.fetchTiddler(this.listName)
		if(!listTiddler || !listTiddler.text) return
		wikify(listTiddler.text, createTiddlyElement(null, 'div'))

		for(let meta of this.tiddlersMeta) this.loadExternal(meta)
	},
	handler: function(place, macroName, params, wikifier, paramString, tiddler) {
		// parse params, register
		const defaultParam = 'tiddler'
		const pParams = paramString.parseParams(defaultParam, null, true)
		const meta = {}
		meta.tiddlerName = getParam(pParams, defaultParam)
		if(!meta.tiddlerName) return

		// although called .fileName, it actually can contain relative part of a path
		// fallback to meta.tiddlerName is set when calculating the full path
		meta.fileName = getParam(pParams, 'file', '')
		//# check if contains "bad" characters (like " or * ..for local paths only)
		meta.fileFormat = getParam(pParams, 'format', 'text')
		meta.isPlugin = getFlag(pParams, 'plugin') //# allow just "plugin" instead of "plugin:true"?
		const keepInternal = getParam(pParams, 'keepInternal')
		meta.keepInTW = !!keepInternal && keepInternal !== 'false' //# ~
		this.registerExternal(meta)

		// visual feedback
		const macroText = wikifier.source.substring(wikifier.matchStart, wikifier.nextMatch)
		createTiddlyText(place, 'external ')
		createTiddlyLink(place, meta.tiddlerName, true)
		createTiddlyText(place, ' (')
		createTiddlyElement(place, 'code', '', '', macroText.slice(2 + macroName.length + 1, -2))
		createTiddlyText(place, ')')
	},
	// describes tiddlers registered as external, not necessarily loaded
	tiddlersMeta: [],
	registerExternal: function(meta) {
		//# check if already registered, don't register twice
		this.tiddlersMeta.push(meta)
	},
	getMetaFor: function(tiddlerOrTitle) {
		var isTitle = typeof tiddlerOrTitle == "string"
		for(meta of this.tiddlersMeta)
			if(isTitle && meta.tiddlerName == tiddlerOrTitle ||
			  !isTitle && meta.tiddler == tiddlerOrTitle)
				return meta
	},
	loadExternal: function(meta) {
		// sync loading fails on startup because TF injects new mozillaLoadFile too late
//		var tiddlerText = loadFile(getLocalPath(getFullPath(meta.fileName)));
//		onExternalTiddlerLoad(tiddlerText !== null, meta, tiddlerText);
		// so we use async instead:

		const callback = this.onExternalTiddlerLoad
		const path = getFullPath(meta.fileName, meta.tiddlerName, this.getExtension(meta))
		// httpReq("GET", path, callback, meta) uses default dataType,
		// which causes js to get evaluated on load. To avoid this, we customize the ajax call:
		jQuery.ajax({
			type: "GET",
			url: path,
			dataType: "text",
			processData: false,
			cache: false,
			complete: function(xhr, textStatus) {
				if((!xhr.status && location.protocol === "file:") || (xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)
					callback(true, meta, xhr.responseText, path, xhr)
				else
					callback(false, meta, null, path, xhr)
			}
		})
		//# rename onExternalTiddlerLoad into internalizeAndRegister?
	},
	onExternalTiddlerLoad: function(success, meta, responseText) {
		if(!success) return //# notify somehow? may fail because file is not created yet or ...
		const tiddler = config.macros.external.internalizeTiddler(meta, responseText)
		store.addTiddler(tiddler)
		//# what if tiddler already exists?
		if(meta.isPlugin) {
			// make it look normally
			tiddler.tags.pushUnique('systemConfig')
			const author = store.getTiddlerText(tiddler.title + "::Author")
			if(author) {
				tiddler.creator = tiddler.creator || author
				tiddler.modifier = tiddler.modifier || tiddler.creator
			}

			eval(tiddler.text)
			// for plugins introducing macros, formatters etc (may be adjusted in the future)
			refreshAll()
		}
		//meta.lastLoaded = responseText
	},
	saveExternal: function(meta, callback) {
		const fullPath = getFullPath(meta.fileName, meta.tiddlerName, this.getExtension(meta))
		// we don't try to save remote files (yet)
		if(!isLocalAbsolutePath(fullPath)) {
			//# if(callback) callback(.., '[saving remote is not supported]')
			return
		}
		const localPath = getLocalPath(fullPath)

		const contentToSave = this.externalizeTiddler(meta)
		// save only if have something to save
		//if(contentToSave != meta.lastLoaded) {
			saveFile(localPath, contentToSave)
			//# get result of saving, return it
			//# or move externalizing into a separate helper?
		//	meta.lastLoaded = contentToSave
			//# this assumes saving didn't fail, which may be wrong
		//}

		//# if(callback) callback(.., '[...]')
	},
	saveAll: function() {
		let overallSuccess = true
		for(let meta of this.tiddlersMeta) {
			// a tiddler may got created after registration
			if(!meta.tiddler) {
				let tiddlerInStore = store.fetchTiddler(meta.tiddlerName)
				if(tiddlerInStore) {
					meta.tiddler = tiddlerInStore
				} else
					// tiddler doesn't exist and we do nothing
					continue
					//# based on config, we can show a warning instead
			}
			//# if(meta.tiddler.title != meta.tiddlerName)
			//  means tiddler got renamed → change meta.tiddlerName &
			//  update this.listName . If store contains another tiddler
			//  with that name, still keep the registered one?
			overallSuccess = this.saveExternal(meta) && overallSuccess
			//# if saving failed, do something! (.oO dirty, notifying)
		}
		return overallSuccess
	}
}

//# see implementations in STP (share to the core?)
function isAbsolutePath(path) {
	// covers http:, https:, file:, other schemas, windows paths (D:\...)
	if(/^\w+\:/.exec(path)) return true
	// unix absolute paths, starting with /
	if(/^\//.exec(path)) return true
	return false
}
function isLocalAbsolutePath(path) {
	//# rename? we're going to check whether an absolute path is local, not path is absolute local
	return /^\w\:/.exec(path) || /^\//.exec(path) || /^file\:/.exec(path)
}
function getFullPath(subPath, nameFallback, extension) {
	const fileNamePosition = subPath.lastIndexOf('/') + 1
	const fileName = subPath.substr(fileNamePosition)
	if(fileName && fileName.indexOf('.') == -1)
		subPath += '.' + extension
	if(!fileName)
		subPath += nameFallback + '.' + extension

	if(isAbsolutePath(subPath)) return subPath

	const url = window.location.toString()
	const base = url.substr(0, url.lastIndexOf('/') + 1)
	return base + subPath
}

//# ideally, don't save main store if it were not changed
if(!config.macros.external.orig_saveChanges) {
	config.macros.external.orig_saveChanges = saveChanges
	saveChanges = function(onlyIfDirty, tiddlers) {
		config.macros.external.saveAll()
		//# should we do smth about setDirty (if saving of a tiddler failed)?

		return config.macros.external.orig_saveChanges.apply(this, arguments)
	}
}

// hijack method of store (since not present in TiddlyWiki.prototype)
if(!config.macros.external.orig_deleteTiddler) {
	config.macros.external.orig_deleteTiddler = store.deleteTiddler
	store.deleteTiddler = function(title) {
		var registeredMeta = config.macros.external.getMetaFor(title)
		if(registeredMeta) registeredMeta.tiddler = null

		return config.macros.external.orig_deleteTiddler.apply(this, arguments)
	}
}
//}}}