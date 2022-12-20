#!/usr/bin/env node

/*!
 * develarms
 * @author Satoshi Soma (https://github.com/amekusa)
 */

import * as fs from 'node:fs';
import process from 'node:process';
import cp from 'node:child_process';
import semver from 'semver';

const version = '1.1.0';

// options
const opts = {
	dryRun: false,
	global: false,
	config: {
		file: 'package.json',
		key: 'develarms'
	}
};

// parse command line arguments
let args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
	case '-h':
	case '--help':
		help();
		process.exit(0);
	case '-n':
	case '--dryRun':
	case '--dry-run':
		opts.dryRun = true;
		continue;
	case '-g':
	case '--global':
		opts.global = true;
		continue;
	}
	if ((i + 1) == args.length) break;
	switch (args[i]) {
	case '-c':
	case '--config':
		opts.config.file = args[++i];
		continue;
	case '--configKey':
	case '--config-key':
		opts.config.key = args[++i];
		continue;
	}
}

function help() {
	console.log(
`develarms ${version}

Options:
  --dry-run
    Does not actually install the dependencies
    * Aliases: -n, --dryRun

  --global
    Installs the dependencies globally
    * Alias:   -g

  --config <file>
    Specifies JSON file
    * Default: package.json
    * Alias:   -c

  --config-key <key>
    Specifies key of config object
    * Default: develarms
    * Alias:   --configKey

  --help
    Shows this
    * Alias:   -h
`
	);
}

function main() {
	let config;
	try { config = JSON.parse(fs.readFileSync(opts.config.file)) } catch (e) { error(e.message) }
	if (!(opts.config.key in config)) error(`config key '${opts.config.key}' not found in ${opts.config.file}`);
	config = config[opts.config.key];
	if (!opts.global && get('global', config)) opts.global = config.global;
	let deps = {};
	let keys = [
		'pkgs',
		'deps',
		'packages',
		'dependencies'
	];
	for (let i = 0; i < keys.length; i++) {
		if (!(keys[i] in config)) continue;
		if (typeof config[keys[i]] != 'object') continue;
		deps = Object.assign(deps, config[keys[i]]);
	}
	resolveDeps(deps).then(() => {
		console.log(`${grn('Setup complete.')}`);
	}).catch(e => {
		error(e);
	});
}

async function resolveDeps(deps) {
	let names = Object.keys(deps);
	if (!names.length) {
		console.log(`No dependencies.`);
		return;
	}
	console.log(`Resolving dependencies:`, deps, `...`);

	// populate existent packages
	let l, g;
	await Promise.all([
		// locals
		exec(`npm ls ${names.join(' ')} --json --depth=0`).then(out => {
			l = JSON.parse(out).dependencies || {};
		}).catch(() => { l = {} }),
		// globals
		exec(`npm ls -g ${names.join(' ')} --json --depth=0`).then(out => {
			g = JSON.parse(out).dependencies || {};
		}).catch(() => { g = {} })
	]);
	let exist = Object.assign(g, l);
	console.log(`Existent dependencies:`, exist);

	// calculate which packages should be installed
	let installs = [];
	for (let i in deps) {
		let I = deps[i];
		if (typeof I == 'string') I = { version: I }; // support one-liner
		if (!I.version) {
			console.warn(`The dependency '${i}' is skipped due to a lack of 'version' info.`);
			continue;
		}
		if (i in exist && semver.satisfies(exist[i].version, I.version)) {
			console.log(`You have already installed a sufficient version of '${i}'.`, `\n - Existent: ${exist[i].version}`, `\n - Required: ${I.version}`);
			continue;
		}
		installs.push(i+'@'+I.version);
	}
	if (!installs.length) {
		console.log(`Nothing to install.`);
		return;
	}

	// install packages
	console.log(`Installing ${installs.join(', ')} ...`);
	let args = '';
	if (opts.dryRun) args += ' --dry-run';
	if (opts.global) args += ' --global';
	return exec(`npm i --no-save${args} ${installs.join(' ')}`).then(() => {
		console.log(`Installation complete.`);
		console.log(`All the dependencies have been resolved.`);

	}).catch(e => {
		error(e);
	});
}


// ---- utils -------- -

function get(key, obj, def = undefined) {
	if (key in obj) return obj[key];
	obj[key] = def;
	return def;
}

function error(msg) {
	console.error(`[${RED('ERROR')}]`, msg);
	process.exit(1);
}

function warn(msg) {
	console.warn(`[${ylw('WARN')}]`, msg);
}

function exec(cmd) {
	return new Promise((resolve, reject) => {
		console.log(`[exec]`, cmd);
		cp.exec(cmd, {}, function(err, out) {
			if (!err) return resolve(out);
			return reject(err);
		});
	});
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
