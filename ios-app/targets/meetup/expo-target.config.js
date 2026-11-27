/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TodaysMeetup',
  displayName: "Today's Restaurant Meetup",
  bundleIdentifier: '.meetup',
  deploymentTarget: '17.0',
  icon: '../../assets/icon.png',
  colors: {
    $widgetBackground: '#2A1240',
    $accent: '#FFC861',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios?.entitlements?.['com.apple.security.application-groups'] || ['group.app.flarmalodebop.ios'],
  },
});
