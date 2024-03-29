# ![DevelArms](https://raw.githubusercontent.com/amekusa/develarms/master/logo.png)
Alternative `devDependencies` resolver that doesn't waste disk space

[![npm package](https://img.shields.io/badge/dynamic/json?label=npm%0Apackage&query=%24%5B%27dist-tags%27%5D%5B%27latest%27%5D&url=https%3A%2F%2Fregistry.npmjs.org%2Fdevelarms%2F)](https://www.npmjs.com/package/develarms)


## Q. What's this?
This is a CLI program to install/manage the development tools of your project, such as `rollup`, `mocha`, `c8`, `jsdoc`, or whatsoever.

## Q. Why not just use `devDependencies` ?
The tools like listed above should be installed/used as **global** packages, because they are just commandline utilities.<br>
Assuming you are working on many projects that require these tools, it would be a huge waste of disk space if you install them as `devDependencies` of each project separately like this:

```
project1/
└── node_modules/
    ├── rollup@3.x.x
    └── mocha@10.x.x
project2/
└── node_modules/
    ├── rollup@3.x.x (duplicate)
    └── jsdoc@4.x.x
project3/
└── node_modules/
    ├── mocha@10.x.x (duplicate)
    └── jsdoc@3.x.x
```

DevelArms can solve this problem to like this:

```
node_modules/ (global)
├── rollup@3.x.x
├── mocha@10.x.x
└── jsdoc@4.x.x

project1/
project2/
project3/
└── node_modules/
    └── jsdoc@3.x.x
```

## Installation

Local:
```sh
npm i --save-dev develarms
```

Global:
```sh
npm i -g develarms
```

## Usage

### Adding dependencies to your project
```sh
# example
develarms i rollup mocha
```

The above command installs `rollup` and `mocha` packages by internally executing:

```sh
npm i --no-save rollup mocha
```

Thanks to `--no-save` option, this command doesn't affect `dependencies` nor `devDependencies` in your `package.json`. Instead, the command adds **`develarms`** property, and stores the installed packages info as its properties like this:

```jsonc
// package.json
{
  "name": "my-project",
  ...
  "develarms": {
    "rollup": "^3.28.0",
    "mocha": "^10.2.0"
  }
}
```

### Installing dependencies
```sh
develarms i
```

This command installs all the packages (let's say "dependencies") listed in `develarms` property in your `package.json` in the same manner as `npm i` command with `dependencies/devDependencies` properties.

The big difference from `npm i` command (and the sole purpose of this tool) is however, if you already have *globally* installed some of the dependencies on your machine, `develarms i` command **skips installing them** to save the storage space of your machine.

So, for example, if you have already installed recent version of `rollup` globally before, but have never installed `mocha`, and now run:

```sh
develarms i rollup mocha
```

Then, the command only installs `mocha`, skipping `rollup` which you already have on your machine.

By default, `develarms i` command installs packages *locally*. You can change this behavior by passing `-g` option to force it install *globally*:

```sh
develarms i -g
```

### Other commands & options

```sh
develarms --help
```

```sh
Options:
  -V, --version                       output the version number
  -c, --config <file>                 config file (default: "package.json")
  -k, --config-key <key>              key of config object (default: "develarms")
  -n, --dry-run                       do not actually perform the operation
  -v, --verbose                       output detailed messages for debug
  -h, --help                          display help for command

Commands:
  list|ls [options]                   list dependencies
  install|i [options] [packages...]   install dependencies
  uninstall|rm <packages...>          uninstall dependencies
  upgrade|up [options] [packages...]  upgrade dependencies
  help [command]                      display help for command
```

## Usage examples

### Custom config key
If you prefer more semantic name than `develarms` for the property in `package.json`, it can be changed with `--config-key` or `-k` option, like this:

```sh
develarms i mocha -k globalDependencies
```

Resulting `package.json`:

```jsonc
{
  ...
  "globalDependencies": {
    "mocha": "^10.2.0"
  }
}
```

---

develarms &copy; 2022 Satoshi Soma (https://github.com/amekusa)