const test = require('node:test');
const { RuleTester } = require('eslint');
const rule = require('../../eslint-rules/no-unsafe-html');

RuleTester.describe = (name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
RuleTester.itOnly = RuleTester.it;

const tester = new RuleTester({ languageOptions: { sourceType: 'module', ecmaVersion: 'latest' } });
const unsafe = [{ messageId: 'unsafe' }];

tester.run('no-unsafe-html', rule, {
  valid: [
    'el.innerHTML = "";',
    'el.innerHTML = `<b>${escapeHtml(name)}</b>`;',
    'el.innerHTML = `<i>${items.length}</i>`;',
    'el.innerHTML = list.map((x, i) => `<li data-i="${i}">${escapeHtml(x)}</li>`).join("");',
    'const SIZES = [10, 25]; el.innerHTML = SIZES.map(n => `<option>${n}</option>`).join("");',
    'const ICONS = { a: "<svg/>" }; el.innerHTML = `<span>${ICONS.a}</span>`;',
    'function row(t) { return `<td>${escapeHtml(t)}</td>`; } el.innerHTML = `<tr>${row(x)}</tr>`;',
    'const rowHtml = build(); el.innerHTML = rowHtml;',
    'el.insertAdjacentHTML("beforeend", `<em>${icon("x")}</em>`);',
    'const label = cond ? "a" : "b"; el.innerHTML = `<p>${label}</p>`;',
    'const s = `not markup ${raw}`;',
  ],
  invalid: [
    { code: 'el.innerHTML = `<b>${name}</b>`;', errors: unsafe },
    { code: 'el.innerHTML = name;', errors: unsafe },
    { code: 'el.innerHTML = "<b>" + name + "</b>";', errors: unsafe },
    { code: 'el.outerHTML = `<i>${user.label}</i>`;', errors: unsafe },
    { code: 'el.insertAdjacentHTML("afterend", `<span>${text}</span>`);', errors: unsafe },
    { code: 'function f(side) { return `<div class="${side}"></div>`; }', errors: unsafe },
    { code: 'const html = `<ul>${list.map(x => `<li>${x}</li>`).join("")}</ul>`;', errors: [{ messageId: 'unsafe' }, { messageId: 'unsafe' }] },
    { code: 'function row(t) { return `<td>${t}</td>`; } el.innerHTML = `<tr>${row(x)}</tr>`;', errors: [{ messageId: 'unsafe' }, { messageId: 'unsafe' }] },
  ],
});
