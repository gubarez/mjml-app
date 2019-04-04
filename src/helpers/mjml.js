import mjml2html from 'mjml'
import { get } from 'lodash'
import migrate from 'mjml-migrate'
import path from 'path'
import stream from 'stream'

import { execFile, exec } from 'helpers/fs'

import storage from 'electron-json-storage'
import { promisify } from 'es6-promisify'

import Handlebars from 'handlebars'
import HandlebarsHelpers from 'handlebars-helpers'
HandlebarsHelpers({handlebars: Handlebars})

const storageGet = promisify(storage.get)

export default function(mjmlContent, filePath, mjmlPath = null, options = {}) {
  return new Promise(resolve => {
    window.requestIdleCallback(async () => {
      try {
        const settings = await storageGet('settings')
        const useMjmlConfig = get(settings, 'mjml.useMjmlConfig')
        const mjmlConfigPath = get(settings, 'mjml.mjmlConfigPath')

        if (mjmlPath) {
          let mjmlConfigOption = []
          if (useMjmlConfig) {
            if (mjmlConfigPath) {
              mjmlConfigOption = [`--config.mjmlConfigPath=${settings.mjml.mjmlConfigPath}`]
            } else {
              mjmlConfigOption = [`--config.mjmlConfigPath=${path.dirname(filePath)}`]
            }
          }

          const args = [
            '-s',
            '--config.validationLevel=skip',
            ...(options.minify ? ['-m'] : []),
            ...mjmlConfigOption,
          ]

          if (!mjmlContent.trim().startsWith('<mjml')) {
            const stdinStream = new stream.Readable()
            stdinStream.push(wrapIntoMJMLTags(mjmlContent))
            stdinStream.push(null)
            args.push('-i')

            const res = await execFile(mjmlPath, args, { maxBuffer: 500 * 1024 }, stdinStream)
            if (res.err) {
              return resolve({ html: '', errors: [] })
            }

            resolve({ html: res.stdout, errors: [] })
          } else {
            const res = await exec(`${mjmlPath} "${filePath}" ${args.join(' ')}`, {
              maxBuffer: 500 * 1024,
            })

            if (res.err) {
              return resolve({ html: '', errors: [] })
            }

            resolve({ html: res.stdout, errors: [] })
          }
        } else {
          if (!mjmlContent.trim().startsWith('<mjml')) {
            mjmlContent = wrapIntoMJMLTags(mjmlContent)
          }

          const mjmlOptions = {
            filePath,
            minify: !!options.minify,
            mjmlConfigPath: useMjmlConfig
              ? settings.mjml.mjmlConfigPath || path.dirname(filePath)
              : null,
          }

          const stdinStream = new stream.Readable()
          let data = await execFile('node', [`${filePath.replace('.mjml', '.js')}`], { maxBuffer: 512 * 512 * 1024 }, stdinStream)
          try { 
            if(data.err)
              data = {}
            else
              data = JSON.parse(data.stdout)
          } catch(err) {
            data = {}
          }          
          const res = mjml2html(Handlebars.compile(mjmlContent)(data), mjmlOptions)

          resolve({ html: res.html || '', errors: res.errors || [] })
        }
      } catch (e) {
        resolve({ html: '', errors: [] })
      }
    })
  })
}

export function wrapIntoMJMLTags(content) {
  return `<mjml>
  <mj-body>
    ${content}
  </mj-body>
</mjml>`
}

export function migrateToMJML4(content) {
  return migrate(content)
}
