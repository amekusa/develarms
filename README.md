# DEVELARMS

## Installation

Local:
```sh
npm i develarms
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

The command is also aware of your *globally* installed packages and *respects* them. For this example, if you have already installed `mocha` globally, the command only installs `rollup` to save the disk space.

---

develarms &copy; 2022 Satoshi Soma (https://github.com/amekusa)