#!/usr/bin/env node

/*!
 * develarms
 * @author Satoshi Soma (https://github.com/amekusa)
 */

import * as fs from 'node:fs';
import process from 'node:process';
import cp from 'node:child_process';
import semver from 'semver';

// options
const opts = {
	dryRun: '',
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
		console.log(`
Options:
  --dry-run
    Does not actually install the dependencies
    * Aliases: -n, --dryRun

  --config <file>
    Specifies JSON file
    * Default: package.json
    * Alias:   -c

  --config-key <key>
    Specifies key of config object key
    * Default: develarms
    * Alias:   --configKey
`);
		process.exit(0);
	case '-n':
	case '--dryRun':
	case '--dry-run':
		opts.dryRun = ' --dry-run';
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

function main() {
	let config = JSON.parse(fs.readFileSync(opts.config.file));
	if (!(opts.config.key in config)) throw new Error(`Config key '${opts.config.key}' not found in ${opts.config.file}`);
	config = config[opts.config.key];
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
		console.log(`Setup complete.`);
	}).catch(e => {
		console.error(e);
		console.error(`Setup failed.`);
		process.exit(1);
	});
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
			console.log(`You have already had a sufficient version of '${i}'.`, `\n - Existent: ${exist[i].version}`, `\n - Required: ${I.version}`);
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
	return exec(`npm i --no-save${opts.dryRun} ${installs.join(' ')}`).then(() => {
		console.log(`Installation complete.`);
		console.log(`All the dependencies have been resolved.`);

	}).catch(e => {
		console.error(e)
		throw new Error(`Installation failed.`);
	});
}

main();
