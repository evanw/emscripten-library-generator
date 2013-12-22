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
      node = estraverse.replace(node, { enter: function(node) { if (node.dependency && dependencies.indexOf(node.dependency) < 0) dependencies.push(node.dependency); } });
      return node;
    });

    // Prefix the entry with dependencies if there are any
    if (dependencies.length > 0) {
      entries.push({
        type: 'Property',
        key: { type: 'Identifier', name: name + '__deps' },
        value: { type: 'ArrayExpression', elements: dependencies.map(function(name) { return { type: 'Literal', value: name }; }) },
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
  var input = { type: 'Program', body: [] };
  files.forEach(function(file) {
    var node = esprima.parse(fs.readFileSync(file, 'utf8'), { loc: true });
    estraverse.traverse(node, { enter: function(node) { node.loc.file = file; } });
    input.body = input.body.concat(node.body);
  });

  // Analyze the input and rename all global references
  var scopeManager = escope.analyze(input, { optimistic: true });
  scopeManager.scopes.forEach(function(scope) {
    scope.references.forEach(function(reference) {
      if (reference.resolved !== null && reference.resolved.scope.type === 'global' && reference.resolved.identifiers.indexOf(reference.identifier) < 0) {
        var name = reference.identifier.name;
        reference.identifier.dependency = name;
        reference.identifier.name = '_' + name;
      }
    });
  });

  // Generate output
  var output = esprima.parse('mergeInto(LibraryManager.library, {})');
  var entries = output.body[0].expression.arguments[1].properties;
  input.body.forEach(function(node) {
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach(function(node) {
        entry(node.id.name, function(substitute) {
          return { type: 'Literal', value: node.init ? escodegen.generate(substitute(node.init)) : 'null' };
        });
      });
    } else if (node.type === 'FunctionDeclaration') {
      entry(node.id.name, function(substitute) {
        return { type: 'FunctionExpression', params: node.params, body: substitute(node).body };
      });
    } else {
      console.error('\nUnsupported top-level statement in ' + node.loc.file + ' on line ' + node.loc.start.line +
        '\nWrap top-level statements in a function and invoke it from inside main()\n');
      process.exit(1);
    }
  });
  return escodegen.generate(output);
};

if (require.main === module) {
  console.log(exports.generate(process.argv.slice(2)));
}
