#!/usr/bin/env node

/*!
 * develarms
 * @author Satoshi Soma (https://github.com/amekusa)
 */

import * as fs from 'node:fs';
import process from 'node:process';
import cp from 'node:child_process';
import semver from 'semver';
import { Command } from 'commander';

const version = '1.2.1';

let options = {
	dryRun: false,
	verbose: false,
	global: false,
	config: 'package.json',
	configKey: 'develarms'
};

let config;

function main() {
	let cmd = new Command();

	let action = (name, args) => {
		options = Object.assign(options, cmd.optsWithGlobals());
		config = new Config(options.config);
		config.load();
		debug(`config loaded:`, config.data);

		switch (name) {
		case 'install':
			install(args);
			break;
		}
	};

	cmd.name('develarms')
		.description('Alternative `devDependency` resolver')
		.option('-c, --config <file>', 'Config file', 'package.json')
		.option('-k, --config-key <key>', 'Key of config object', 'develarms')
		.option('-n, --dry-run', 'Does not actually perform the operation')
		.option('-v, --verbose', 'Output detailed messages for debug')
		.version(version);

	cmd.command('install')
		.alias('i')
		.alias('add')
		.description('Installs dependencies')
		.argument('[packages...]', '(Optional) Packages to add to deps')
		.option('-g, --global', 'Installs the packages globally')
		.action(pkgs => { action('install', pkgs) });

	cmd.parse();
}

async function install(pkgs = []) {
	if (pkgs.length) {
		let installs = {};
		let tasks = [];
		for (let i = 0; i < pkgs.length; i++) {
			tasks.push(exec(`npm view --json ${pkgs[i]} name version`).then(resp => {
				let data = JSON.parse(resp);
				if (typeof data != 'object') throw `invalid response from npm`;
				if (Array.isArray(data)) data = data[0];
				installs[data.name] = '^' + data.version;
			}).catch(error));
		}
		await Promise.all(tasks);
		config.assign({ [options.configKey]: installs });
		if (!options.dryRun) config.save();
	}
	return resolveDeps(config.data[options.configKey] || {});
}

async function resolveDeps(deps) {
	let names = Object.keys(deps);
	if (!names.length) return warn(`no dependencies`);
	log(`Resolving dependencies:`, deps, `...`);

	// Populate existing packages
	let exist = {}; await Promise.all([
		// Locals
		exec(`npm ls ${names.join(' ')} --json --depth=0`).then(out => {
			exist.local = JSON.parse(out).dependencies || {};
		}).catch(() => {
			exist.local = {};
		}),
		// Globals
		exec(`npm ls -g ${names.join(' ')} --json --depth=0`).then(out => {
			exist.global = JSON.parse(out).dependencies || {};
		}).catch(() => {
			exist.global = {};
		})
	]);
	log(`Existing dependencies:`, exist);

	// Calculate which packages should be installed
	let installs = [];
	LOOP1: for (let i in deps) {
		let item = deps[i];
		if (typeof item == 'string') item = { version: item }; // Support one-liner
		if (!item.version) {
			warn(`ignored dependency '${i}' due to a lack of 'version' info`);
			continue;
		}
		for (let scope in exist) {
			if (i in exist[scope] && semver.satisfies(exist[scope][i].version, item.version)) {
				log(`You already have a sufficient version of '${i}' in ${scope}.`);
				log(` - Existing: ${exist[scope][i].version}`);
				log(` - Required: ${item.version}`);
				continue LOOP1;
			}
		}
		installs.push(i+'@'+item.version);
	}
	if (!installs.length) return log(`Nothing to install.`);

	// Install packages
	log(`Installing ${installs.join(', ')} ...`);
	let args = '';
	if (options.dryRun) args += ' --dry-run';
	if (options.global) args += ' --global';
	return exec(`npm install --no-save${args} ${installs.join(' ')}`).then(() => {
		log(`Installation complete.`);
		log(`All the dependencies have been resolved.`);
	}).catch(error);
}

}


// ---- utils -------- -

function get(key, obj, def = undefined) {
	if (key in obj) return obj[key];
	obj[key] = def;
	return def;
}

function dig(path, obj, opts = {}) {
	path = path.split('.');
	let i = 0;
	let n = path.length - 1;
	for (; i < n; i++) {
		let key = path[i];
		if (key in obj) {
			if (i == n) {
				if ('set' in opts) obj[key] = opts.set;
				return obj[key];
			}
			if (typeof obj[key] != 'object') throw `unexpected object structure`;
			obj = obj[key];
			continue;
		}
		if ('makePath' in opts && opts.makePath) {
			for (;; i++) {
				obj[key] = {};
				obj = obj[key];
			}
		}
	}
	obj[path[n]] = set;
	return set;
}

function error(...msg) {
	console.error(`[${RED('ERROR')}]`, ...msg);
	process.exit(1);
}

function warn(...msg) {
	console.warn(`[${ylw('WARN')}]`, ...msg);
}

function debug(...msg) {
	if (options.verbose) console.debug(`[${grn('INFO')}]`, ...msg);
}

function log(...msg) {
	console.log(...msg);
}

function exec(cmd) {
	debug(`CMD:`, cmd);
	return new Promise((resolve, reject) => {
		cp.exec(cmd, {}, function(err, out) {
			if (!err) return resolve(out);
			return reject(err);
		});
	});
}

function merge(a, b, recursion = 4) {
	if (recursion && a && typeof a == 'object' && b && typeof b == 'object') {
		for (let key in b) a[key] = merge(a[key], b[key], recursion - 1);
	} else return b;
	return a;
}

class Config {
	constructor(file) {
		this.file = file;
		this.data = null;
	}
	load() {
		let loaded; try {
			loaded = JSON.parse(fs.readFileSync(this.file));
		} catch (e) { error(e.message) }
		this.data = loaded;
	}
	assign(data) {
		this.data = merge(this.data, data, 4);
	}
	sync() {
		let _data = this.data;
		this.load();
		this.assign(_data);
	}
	save() {
		this.sync();
		try {
			fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
		} catch (e) { error(e.message) }
	}
}


// ---- color utils -------- -

const ESC = '\x1b[';
const RST = `${ESC}0m`;

function red(str) {
	return `${ESC}0;31m${str}${RST}`;
}

function RED(str) {
	return `${ESC}1;31m${str}${RST}`;
}

function grn(str) {
	return `${ESC}0;32m${str}${RST}`;
}

function GRN(str) {
	return `${ESC}1;32m${str}${RST}`;
}

function ylw(str) {
	return `${ESC}0;33m${str}${RST}`;
}

function YLW(str) {
	return `${ESC}1;33m${str}${RST}`;
}

main();
