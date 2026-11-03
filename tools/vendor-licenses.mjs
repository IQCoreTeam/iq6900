import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';

export async function writeBundleLicenses(metafile,outfile) {
  const packages=new Set();
  for(const output of Object.values(metafile.outputs))for(const[file,info]of Object.entries(output.inputs||{})){
    if(!info.bytesInOutput||!file.includes('node_modules/'))continue;
    let dir=dirname(resolve(file));
    while(dir!==dirname(dir)){
      try{await readFile(join(dir,'package.json'));packages.add(dir);break;}
      catch{dir=dirname(dir);}
    }
  }
  const notices=[];
  for(const dir of [...packages].sort()){
    const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
    notices.push(`${pkg.name}@${pkg.version}\nLicense: ${pkg.license||'See package'}\n`);
    const files=(await readdir(dir)).filter(name=>/^(license|notice|copying)(\.|$)/i.test(name));
    for(const file of files)notices.push(await readFile(join(dir,file),'utf8'));
    if(!files.length&&pkg.license==='Apache-2.0')notices.push(await readFile(new URL('./licenses/Apache-2.0.txt',import.meta.url),'utf8'));
  }
  await writeFile(outfile,notices.join('\n\n---\n\n'));
}
