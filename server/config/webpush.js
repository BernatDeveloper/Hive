import webpush from 'web-push'
import { config } from './env.js'

webpush.setVapidDetails(
  config.vapid.subject,
  config.vapid.publicKey,
  config.vapid.privateKey,
)

export default webpush
