#!/usr/bin/env node

var fs = require('fs');
var escope = require('escope');
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

exports.generate = function(files) {
  function entry(name, callback) {
    // Generate the value and find all dependencies on global identifiers
    var dependencies = [];
    var value = callback(function(node) {
      node = estraverse.replace(node, {
        enter: function(node) {
          if (node.dependency && dependencies.indexOf(node.dependency) < 0) {
            dependencies.push(node.dependency);
          }
        },
      });
      return node;
    });

    // Prefix the entry with dependencies if there are any
    if (dependencies.length > 0) {
      entries.push({
        type: 'Property',
        key: { type: 'Identifier', name: name + '__deps' },
        value: {
          type: 'ArrayExpression',
          elements: dependencies.map(function(name) {
            return { type: 'Literal', value: name };
          }),
        },
      });
    }

    // Generate the entry
    entries.push({
      type: 'Property',
      key: { type: 'Identifier', name: name },
      value: value,
    });
  }

  // Parse the input
  var failed = false;
  var input = { type: 'Program', body: [] };
  files.forEach(function(file) {
    try {
      var data = fs.readFileSync(file, 'utf8');
      var node = esprima.parse(data, { loc: true });
    } catch (e) {
      var lines = data.split('\n').slice(e.lineNumber - 1, e.lineNumber + 1);
      console.error('Could not parse ' + file + ': ' + e.message + '\n\n' + lines.join('\n') + '\n');
      failed = true;
      return;
    }

    // Remember the file of each parsed node for use in error messages
    estraverse.traverse(node, {
      enter: function(node) {
        node.loc.file = file;
      },
    });

    // Combine all files into one big program for analysis
    input.body = input.body.concat(node.body);
  });
  if (failed) process.exit(1);

  // Analyze the input
  var scopeManager = escope.analyze(input, { optimistic: true });
  var unresolved = [];
  scopeManager.scopes.forEach(function(scope) {
    scope.references.forEach(function(reference) {
      // Rename references to globals so they start with an underscore since emscripten will add one
      if (reference.resolved !== null && reference.resolved.scope.type === 'global' && reference.resolved.identifiers.indexOf(reference.identifier) < 0) {
        var name = reference.identifier.name;
        reference.identifier.dependency = name;
        reference.identifier.name = '_' + name;
      }

      // Remember all references to unresolved globals that start with an underscore since those are likely C identifiers
      else if (reference.resolved === null && reference.identifier.name[0] === '_' && unresolved.indexOf(reference.identifier.name) < 0) {
        unresolved.push(reference.identifier.name);
      }
    });
  });

  // Generate an emscripten library
  var output = esprima.parse('mergeInto(LibraryManager.library, {})');
  var entries = output.body[0].expression.arguments[1].properties;
  input.body.forEach(function(node) {
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach(function(node) {
        entry(node.id.name, function(substitute) {
          return {
            type: 'Literal',
            value: node.init ? escodegen.generate(substitute(node.init)) : 'null',
          };
        });
      });
    } else if (node.type === 'FunctionDeclaration') {
      entry(node.id.name, function(substitute) {
        return {
          type: 'FunctionExpression',
          params: node.params,
          body: substitute(node).body,
        };
      });
    } else {
      console.error('\nUnsupported top-level statement in ' + node.loc.file + ' on line ' + node.loc.start.line +
        '\nWrap top-level statements in a function and invoke it from inside main()\n');
      process.exit(1);
    }
  });

  return {
    library: escodegen.generate(output),
    unresolved: unresolved,
  };
};

function main() {
  // Mini argument parser
  var flags = {};
  var args = process.argv.slice(2).filter(function(arg) {
    if (['-h', '-help', '--help', '--unresolved'].indexOf(arg) < 0) return true;
    flags[arg] = true;
    return false;
  });

  // Display a help message
  if (args.length === 0 || flags['-h'] || flags['-help'] || flags['--help']) {
    console.log('usage: emscripten-library-generator [--unresolved] input1.js input2.js ...');
    return;
  }

  // Generate and output the result
  var result = exports.generate(args);
  console.log(flags['--unresolved'] ? JSON.stringify(result.unresolved) : result.library);
}

// Allow use as a terminal command and as a library
if (require.main === module) {
  main();
}
