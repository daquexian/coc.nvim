import { attach, NeovimClient } from '@chemzqm/neovim'
import { Attach } from '@chemzqm/neovim/lib/attach/attach'
import events from './events'
import Plugin from './plugin'
const logger = require('./util/logger')('attach')

export default function(opts: Attach): Plugin {
  const nvim: NeovimClient = attach(opts)
  const plugin = new Plugin(nvim)
  nvim.on('notification', async (method, args) => {
    switch (method) {
      case 'VimEnter':
        await plugin.init()
        return
      case 'CocAutocmd':
        await events.fire(args[0], args.slice(1))
        return
      default:
        const m = method[0].toLowerCase() + method.slice(1)
        if (typeof plugin[m] == 'function') {
          try {
            await Promise.resolve(plugin[m].apply(plugin, args))
          } catch (e) {
            // tslint:disable-next-line:no-console
            console.error(`error on notification '${method}': ${e}`)
          }
        }
    }
  })

  nvim.on('request', (method: string, args, resp) => {
    switch (method) {
      case 'CocAutocmd':
        // tslint:disable-next-line:no-floating-promises
        events.fire(args[0], args.slice(1)).then(() => {
          resp.send()
        })
        return
      default:
        let m = method[0].toLowerCase() + method.slice(1)
        if (typeof plugin[m] !== 'function') {
          return resp.send(`Action ${m} not found`, true)
        }
        plugin[m].apply(plugin, args).then(res => {
          resp.send(res)
        }, e => {
          logger.error(`Action ${m} error: ` + e.stack)
          resp.send(e.message, true)
        })
    }
  })

  nvim.channelId.then(async channelId => {
    await nvim.setVar('coc_node_channel_id', channelId)
    let entered = await nvim.getVvar('vim_did_enter')
    if (entered) plugin.init().catch(e => {
      logger.error(e)
    })
  }).catch(e => {
    console.error(`Channel create error: ${e.message}`) // tslint:disable-line
  })
  return plugin
}
