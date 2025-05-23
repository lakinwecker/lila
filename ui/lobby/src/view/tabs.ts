import { h } from 'snabbdom';
import { bind, type MaybeVNodes } from 'lib/snabbdom';
import type LobbyController from '../ctrl';
import type { Tab } from '../interfaces';

function tab(ctrl: LobbyController, key: Tab, active: Tab, content: MaybeVNodes) {
  return h(
    'span',
    {
      attrs: { role: 'tab' },
      class: { active: key === active, glowing: key !== active && key === 'pools' && !!ctrl.poolMember },
      hook: bind('mousedown', _ => ctrl.setTab(key), ctrl.redraw),
    },
    content,
  );
}

export default function (ctrl: LobbyController) {
  const nbPlaying = ctrl.data.nbNowPlaying,
    myTurnPovsNb = ctrl.data.nowPlaying.filter(p => p.isMyTurn).length,
    active = ctrl.tab,
    isBot = ctrl.me?.isBot;
  return [
    isBot ? undefined : tab(ctrl, 'pools', active, [i18n.site.quickPairing]),
    isBot ? undefined : tab(ctrl, 'real_time', active, [i18n.site.lobby]),
    isBot ? undefined : tab(ctrl, 'seeks', active, [i18n.site.correspondence]),
    active === 'now_playing' || nbPlaying || isBot
      ? tab(ctrl, 'now_playing', active, [
          ...i18n.site.nbGamesInPlay.asArray(nbPlaying, nbPlaying >= 100 ? '100+' : nbPlaying.toString()),
          myTurnPovsNb > 0 ? h('i.unread', myTurnPovsNb >= 9 ? '9+' : myTurnPovsNb) : null,
        ])
      : null,
  ];
}
