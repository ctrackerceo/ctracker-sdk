/**
 * BUILD ES MODULE VERSION
 * Convierte el SDK CommonJS a ES modules para compatibilidad con frontend
 */
const fs = require('fs');
const path = require('path');

console.log('🔧 [BUILD-ESM] Convirtiendo SDK a ES modules...');

// Leer el archivo principal
const indexPath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// Conversiones CommonJS -> ES modules
const conversions = [
  // require() -> import
  {
    from: /const { ethers } = require\('ethers'\);/g,
    to: "import { ethers } from 'ethers';"
  },
  {
    from: /require\('dotenv'\)\.config\(\);/g,
    to: "// dotenv config handled by build environment"
  },
  // module.exports -> export
  {
    from: /module\.exports = {([\s\S]*?)};?\s*$/,
    to: (match, exports) => {
      // Extraer las exportaciones
      const exportLines = exports.trim().split(',\n').map(line => {
        const cleaned = line.trim().replace(/,$/, '');
        if (cleaned.includes(':')) {
          // Exportación con alias
          const [name, value] = cleaned.split(':').map(s => s.trim());
          return `export { ${value} as ${name} };`;
        } else {
          // Exportación directa
          return `export { ${cleaned} };`;
        }
      });
      
      return exportLines.join('\n');
    }
  }
];

// Aplicar conversiones
conversions.forEach(({ from, to }) => {
  if (typeof to === 'function') {
    content = content.replace(from, to);
  } else {
    content = content.replace(from, to);
  }
});

// Manejar exportaciones al final del archivo
if (content.includes('module.exports = {')) {
  // Extraer las exportaciones del final
  const moduleExportsMatch = content.match(/module\.exports = \{([\s\S]*?)\};?\s*$/);
  if (moduleExportsMatch) {
    const exportsContent = moduleExportsMatch[1];
    const exportNames = [];
    
    // Parsear las exportaciones
    exportsContent.split(',').forEach(line => {
      const cleaned = line.trim().replace(/,$/, '');
      if (cleaned && !cleaned.startsWith('//')) {
        exportNames.push(cleaned);
      }
    });
    
    // Reemplazar module.exports con exports individuales
    const individualExports = exportNames.map(name => `export { ${name} };`).join('\n');
    content = content.replace(/module\.exports = \{[\s\S]*?\};?\s*$/, individualExports);
  }
}

// Escribir archivo ES module
const esmPath = path.join(__dirname, 'index.esm.js');
fs.writeFileSync(esmPath, content);

console.log('✅ [BUILD-ESM] ES module creado:', esmPath);
console.log('🚀 [BUILD-ESM] SDK listo para compatibilidad dual!');
