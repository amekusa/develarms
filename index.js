#!/usr/bin/env node

/*!
 * develarms
 * @author Satoshi Soma (https://github.com/amekusa)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import cp from 'node:child_process';
import semver from 'semver';
import { Command, Option } from 'commander';

const version = '2.2.1';

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
		.description('Alternative `devDependencies` resolver')
		.option('-c, --config <file>', 'config file', 'package.json')
		.option('-k, --config-key <key>', 'key of config object', 'develarms')
		.option('-n, --dry-run', 'do not actually perform the operation')
		.option('-v, --verbose', 'output detailed messages for debug')
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
		.description('list dependencies')
		.option('--json', 'output in JSON format')
		.action(list);

	app.command('install')
		.alias('i')
		.alias('add')
		.description('install dependencies')
		.argument('[packages...]', '(optional) packages to add to deps')
		.option('-g, --global', 'install globally')
		.action(install);

	app.command('uninstall')
		.alias('rm')
		.description('uninstall dependencies')
		.argument('<packages...>', 'packages to remove from deps')
		.action(uninstall);

	app.command('upgrade')
		.alias('up')
		.alias('bump')
		.description('upgrade dependencies')
		.argument('[packages...]', '(optional) packages to upgrade. if omitted, all the deps will be upgraded')
		.addOption(new Option('-t, --target <target>', 'which version the deps should upgrade to').choices(['major', 'minor', 'patch']).default('major'))
		.action(upgrade);

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
			tasks.push(pkgInfo(pkgs[i]).then(data => {
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
		if (!Object.keys(deps).length) config.remove(options.configKey);
		config.save();
		log(`Uninstallation complete.`);
	}).catch(error);
}

async function upgrade() {
	let pkgs = this.args;
	let opts = this.opts();

	let deps = config.get(options.configKey, {});
	let upgrades = {};
	if (pkgs && pkgs.length) {
		for (let i = 0; i < pkgs.length; i++) {
			if (pkgs[i] in deps) upgrades[pkgs[i]] = deps[pkgs[i]];
			else warn(`ignored '${pkgs[i]}' since it is not listed in the config`);
		}
	} else Object.assign(upgrades, deps);

	let tasks = [];
	for (let i in upgrades) {
		let v = semver.coerce(upgrades[i]);
		let suffix = '';
		switch (opts.target) {
			case 'minor': suffix = `@${v.major}`; break;
			case 'patch': suffix = `@${v.major}.${v.minor}`; break;
		}
		tasks.push(pkgInfo(i + suffix).then(data => {
			upgrades[i] = '^' + data.version;
			log(`${i}: ${deps[i]} => ${upgrades[i]}`);
		}).catch(error));
	}
	return Promise.all(tasks).then(() => {
		config.sync().assign({ [options.configKey]: upgrades }).save();
		log(`Upgraded the dependencies.`);
		log(`Run 'develarms i' to install.`);
	});
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

function merge(x, y, recurse = 8) {
	if (recurse && x && y && typeof x == 'object' && typeof y == 'object' && !Array.isArray(x) && !Array.isArray(y)) {
		for (let key in y) x[key] = merge(x[key], y[key], recurse - 1);
	} else return y;
	return x;
}

function write(file, content) {
	return dryRun(() => {
		return writeFileSync(file, content);
	}, `write: '${file}'\n-----CONTENT-----\n${content}\n=======EOF=======`);
}

function pkgInfo(pkg, props = 'name version') {
	return exec(`npm view --json ${pkg} ${props}`).then(resp => {
		let data = JSON.parse(resp);
		if (typeof data != 'object') throw `invalid response from npm`;
		if (Array.isArray(data)) data = data[data.length - 1];
		return data;
	});
}

class Config {
	constructor(file) {
		this.file = file;
		this.data = null;
	}
	load() {
		let loaded; try {
			loaded = JSON.parse(readFileSync(this.file));
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
	remove(key, fallback = undefined) {
		let r = fallback;
		if (this.has(key)) {
			r = this.data[key];
			delete this.data[key];
		}
		return r;
	}
	set(key, value) {
		this.data[key] = value;
		return this;
	}
	assign(data) {
		this.data = merge(this.data, data, 8);
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
