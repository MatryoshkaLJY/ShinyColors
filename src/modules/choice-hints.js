import config from '../config'
import { getModule } from './get-module'
import { log } from '../utils/index'
import catalogue from '../data/choice-effects.json'
import characters from '../data/choice-characters.json'
import { captureChoiceGroups, createChoiceResolver, createChoiceCharacterResolver, resolveDisplayedChoices } from '../utils/choiceEffects'
import { installChoiceHooks } from './story/choiceHooks'
import { createChoiceOverlay } from '../utils/choiceOverlay'

const resolve = createChoiceResolver(catalogue.groups)
const identifyCharacter = createChoiceCharacterResolver(characters)

// This must run before translation. The serializable annotation also survives
// the game's scenario cache (JSON.stringify/parse) and its shuffled copies.
export const captureChoiceEffects = (tracks, path) => {
  try { captureChoiceGroups(tracks, path, resolve, identifyCharacter) } catch (error) { log(error) }
}

let installed = false
export default async function choiceHints () {
  if (installed) return
  try {
    const [adv, aoba] = await Promise.all([getModule('ADV'), getModule('AOBA')])
    if (!adv?.AdvPlayer || !aoba?.game) return
    const overlay = createChoiceOverlay(aoba.game, () => config.choiceHints !== 'off', log)
    installed = installChoiceHooks(adv.AdvPlayer, (player, choices) => {
      overlay.show(player, resolveDisplayedChoices(choices, resolve))
    }, overlay.hide, log)
  } catch (error) {
    log(error)
  }
}
