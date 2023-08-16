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

const version = '2.0.0';

let options = {
	dryRun: false,
	verbose: false,
	config: 'package.json',
	configKey: 'develarms',
};

let config;

async function main() {
	let app = new Command();

	app.name('develarms')
		.version(version)
		.description('Alternative `devDependency` resolver')
		.option('-c, --config <file>', 'Config file', 'package.json')
		.option('-k, --config-key <key>', 'Key of config object', 'develarms')
		.option('-n, --dry-run', 'Does not actually perform the operation')
		.option('-v, --verbose', 'Output detailed messages for debug')
		.hook('preAction', (app, cmd) => {
			options = Object.assign(options, app.opts());
			debug('options:', options);
			debug('command options:', cmd.opts());
			config = new Config(options.config);
			config.load();
			debug(`config loaded:`, config.data);
		});

	app.command('list')
		.alias('ls')
		.description('Lists dependencies')
		.option('--json', 'Outputs in JSON format')
		.action(list);

	app.command('install')
		.alias('i')
		.alias('add')
		.description('Installs dependencies')
		.argument('[packages...]', '(Optional) Packages to add to deps')
		.option('-g, --global', 'Installs the packages globally')
		.action(install);

	app.command('uninstall')
		.alias('rm')
		.description('Uninstalls dependencies')
		.argument('<packages...>', 'Packages to remove from deps')
		.action(uninstall);

	await app.parseAsync();
}

async function list() {
	let opts = this.opts();
	let deps = config.get(options.configKey, {});
	if (opts.json) return log(JSON.stringify(deps));
	for (let key in deps) log(`${key}:`, deps[key]);
}

async function install() {
	let pkgs = this.args;
	let opts = this.opts();

	// Add new packages to deps
	if (pkgs && pkgs.length) {
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
		config.assign({ [options.configKey]: installs }).sync().save();
	}

	// Populate deps to resolve
	let deps = config.get(options.configKey, {});
	pkgs = Object.keys(deps);
	if (!pkgs.length) return log(`No dependencies.`);
	log(`Resolving dependencies:`, deps, `...`);

	// Populate existing packages
	let exist = {}; await Promise.all([
		// Locals
		exec(`npm ls ${pkgs.join(' ')} --json --depth=0`).then(out => {
			exist.local = JSON.parse(out).dependencies || {};
		}).catch(() => {
			exist.local = {};
		}),
		// Globals
		exec(`npm ls -g ${pkgs.join(' ')} --json --depth=0`).then(out => {
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
	if (opts.global)    args += ' --global';
	return exec(`npm install --no-save${args} ${installs.join(' ')}`).then(() => {
		log(`Installation complete.`);
		log(`All the dependencies have been resolved.`);
	}).catch(error);
}

async function uninstall(pkgs) {
	let deps = config.get(options.configKey, {});
	let uninstalls = [];
	for (let item of pkgs) {
		if (item in deps) uninstalls.push(item);
		else warn(`ignored '${item}' since it is not listed in the config`);
	}
	if (!uninstalls.length) return log(`Nothing to uninstall.`);
	let args = '';
	if (options.dryRun) args += ' --dry-run';
	return exec(`npm uninstall --no-save${args} ${uninstalls.join(' ')}`).then(() => {
		let deps = config.sync().get(options.configKey, {});
		for (let item of uninstalls) {
			if (item in deps) delete deps[item];
		}
		config.save();
		log(`Uninstallation complete.`);
	}).catch(error);
}


// ---- Utils -------- *

function error(...msg) {
	console.error(`[${RED('ERROR')}]`, ...msg);
	process.exit(1);
}

function warn(...msg) {
	console.warn(`[${ylw('WARN')}]`, ...msg);
}

function debug(...msg) {
	if (options.verbose) console.debug(`[${cyn('INFO')}]`, ...msg);
}

function dryRun(fn, ...msg) {
	if (options.dryRun) console.debug(`[${mag('DRYRUN')}]`, ...msg);
	else return fn();
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

function write(file, content) {
	return dryRun(() => {
		return fs.writeFileSync(file, content);
	}, `write: '${file}'\n-----CONTENT-----\n${content}\n=======EOF=======`);
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
		return this;
	}
	has(key) {
		return this.data && (key in this.data);
	}
	get(key, fallback = undefined) {
		return this.has(key) ? this.data[key] : fallback;
	}
	set(key, value) {
		this.data[key] = value;
		return this;
	}
	assign(data) {
		this.data = merge(this.data, data, 4);
		return this;
	}
	sync() {
		let _data = this.data;
		this.load();
		this.assign(_data);
		return this;
	}
	save() {
		try {
			write(this.file, JSON.stringify(this.data, null, 2));
		} catch (e) { error(e.message) }
		return this;
	}
}


// ---- Color Utils -------- *

const ESC = '\x1b[';
const RST = `${ESC}0m`;

function red(str) { return `${ESC}0;31m${str}${RST}` }
function RED(str) { return `${ESC}1;31m${str}${RST}` }
function grn(str) { return `${ESC}0;32m${str}${RST}` }
function GRN(str) { return `${ESC}1;32m${str}${RST}` }
function ylw(str) { return `${ESC}0;33m${str}${RST}` }
function YLW(str) { return `${ESC}1;33m${str}${RST}` }
function mag(str) { return `${ESC}0;35m${str}${RST}` }
function MAG(str) { return `${ESC}1;35m${str}${RST}` }
function cyn(str) { return `${ESC}0;36m${str}${RST}` }
function CYN(str) { return `${ESC}1;36m${str}${RST}` }


main();
