// 1. Create a unique brand type for CSS strings
export type CSSString = string & { readonly __brand: unique symbol };

const styleSheet = document.head.appendChild(document.createElement("style"));
const seenHashes = new Set<string>();

function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return "css-" + (hash >>> 0).toString(36);
}

// 2. The Backtick-enabled function
export function css(strings: TemplateStringsArray, ...values: any[]): string {
  // Merge template parts and variables back into a raw string
  const rawCss = strings.reduce(
    (acc, str, i) => acc + str + (values[i] || ""),
    "",
  );
  const className = hashString(rawCss);

  if (!seenHashes.has(className)) {
    seenHashes.add(className);

    const scopedCss = rawCss.replace(/&/g, `.${className}`);
    const finalCss = rawCss.includes("&")
      ? scopedCss
      : `.${className} { ${rawCss} }`;

    styleSheet.appendChild(document.createTextNode(finalCss));
  }

  return className;
}
