# ![DEVELARMS](logo.png)
Alternative `devDependencies` resolver

[![npm package](https://img.shields.io/badge/dynamic/json?label=npm%0Apackage&query=%24%5B%27dist-tags%27%5D%5B%27latest%27%5D&url=https%3A%2F%2Fregistry.npmjs.org%2Fdevelarms%2F)](https://www.npmjs.com/package/develarms)


## Installation

Local:
```sh
npm i --save-dev develarms
```

Global:
```sh
npm i -g develarms
```

## Usage Example

`package.json` :
```json
{
  "name": "your-package",
  "develarms": {
    "dependencies": {
      "rollup": "^3.3.0",
      "mocha": "*"
    }
  }
}
```

Shell:
```sh
develarms
```

The command installs `rollup` and `mocha` with `--no-save` option so it won't affect `package.json` .

The command is also aware of your *globally* installed packages and respects them. For this example, if you have already installed `mocha` globally, the command only installs `rollup` to save the disk space.

## Commandline Options

```sh
develarms --help
```

```sh
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
```

The `--global` option can be set in JSON as well.

```json
{
  "develarms": {
    "global": true,
    "dependencies": {}
  }
}
```

---

develarms &copy; 2022 Satoshi Soma (https://github.com/amekusa)