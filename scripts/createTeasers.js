const nodeHtmlToImage = require('node-html-to-image')
const fs = require('fs');

(async () => {
  try {
    const dir = './_site/teasers'
    const contents = [];
    const createObj = async path => {
      try {
        const files = await fs.promises.readdir(path);
    
        await Promise.all(files.map(async f => {
          const fileType = f.split('.')[1]
          if (fileType !== 'html') return
    
          const data = await fs.promises.readFile(`${path}/${f}`, 'utf-8');
          contents.push({
            htmlString: data,
            output: `${path}/${f.split('.')[0]}.png`,
          });
        }));
      } catch(e) {
        console.log(e);
      }
    }
    await createObj(dir);
    await nodeHtmlToImage({
      html: `<!DOCTYPE html><html lang="en">{{{htmlString}}}</html>`,
      content: contents,
      waitUntil: 'domcontentloaded',
      puppeteerArgs: {
        defaultViewport: {
          width: 800,
          height: 418
        }
      }
    });
  } catch (e) {
    console.log(e);
  }
  console.log('The images were created successfully!');
})();