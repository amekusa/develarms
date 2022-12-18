# DEVELARMS
Alternative `devDependencies` resolver

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

  --config <file>
    Specifies JSON file
    * Default: package.json
    * Alias:   -c

  --config-key <key>
    Specifies key of config object
    * Default: develarms
    * Alias:   --configKey
```

---

develarms &copy; 2022 Satoshi Soma (https://github.com/amekusa)