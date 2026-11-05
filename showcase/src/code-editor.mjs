const tokens = /(?<comment>\/\/[^\n]*|<!--[\s\S]*?-->)|(?<string>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(?<tag><\/?[A-Za-z][\w-]*)|(?<keyword>\b(?:import|from|const|await)\b)|(?<call>\b[A-Za-z_$][\w$]*(?=\())|(?<attribute>[:@\w-]+(?==))|(?<type>\bGlass\w+\b)|(?<punctuation>[{}<>()[\];])/g;
const filenames = { vanilla: 'scene.js', react: 'Scene.jsx', vue: 'Scene.vue', angular: 'scene.html' };

export function renderCodeEditor(framework, source) {
  document.querySelector('#code-filename').textContent = filenames[framework];
  document.querySelector('#code-gutter').textContent = source.split('\n').map((_, index) => index + 1).join('\n');
  const fragment = document.createDocumentFragment();
  let start = 0;
  for (const match of source.matchAll(tokens)) {
    fragment.append(source.slice(start, match.index));
    const token = document.createElement('span');
    token.className = 'syntax-' + Object.keys(match.groups).find(kind => match.groups[kind] !== undefined);
    token.textContent = match[0];
    fragment.append(token);
    start = match.index + match[0].length;
  }
  fragment.append(source.slice(start));
  document.querySelector('#code-text').replaceChildren(fragment);
}
