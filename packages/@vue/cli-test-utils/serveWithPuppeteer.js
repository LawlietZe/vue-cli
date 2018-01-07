const puppeteer = require('puppeteer')

module.exports = async function serveWithPuppeteer (
  project, // should be project created with createTestProject()
  testFn // must be async
) {
  let browser
  let child

  const puppeteerOptions = process.env.CI
    ? { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    : {}

  let notifyUpdate
  const nextUpdate = () => {
    return new Promise(resolve => {
      notifyUpdate = resolve
    })
  }

  await new Promise((resolve, reject) => {
    child = project.run('vue-cli-service serve')

    let isFirstMatch = true
    child.stdout.on('data', async (data) => {
      try {
        const urlMatch = data.toString().match(/http:\/\/[^/]+\//)
        if (urlMatch && isFirstMatch) {
          isFirstMatch = false
          // start browser
          browser = await puppeteer.launch(puppeteerOptions)
          const page = await browser.newPage()
          const url = urlMatch[0]
          await page.goto(url)

          const getText = selector => {
            return page.evaluate(selector => {
              return document.querySelector(selector).textContent
            }, selector)
          }

          await testFn({
            browser,
            page,
            url,
            nextUpdate,
            getText
          })

          await browser.close()
          browser = null
          // on appveyor, the spawned server process doesn't exit
          // and causes the build to hang.
          child.stdin.write('close')
          child = null
          // kill(child.pid)
          resolve()
        } else if (data.toString().match(/App updated/)) {
          if (notifyUpdate) {
            notifyUpdate()
          }
        }
      } catch (err) {
        if (browser) {
          await browser.close()
        }
        if (child) {
          child.stdin.write('close')
        }
        reject(err)
      }
    })

    child.on('exit', code => {
      child = null
      if (code !== 0) {
        reject(`serve exited with code ${code}`)
      }
    })
  })
}
