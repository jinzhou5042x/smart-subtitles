// Target languages shared by the extension (popup, background) and the local service.
// The extension build copies this file into the extension as languages.js.
// Subtitles are always translated from English. `code` is the stored setting, the Google
// Cloud Translation code and part of the episode hash; `name` is shown in the UI and used in
// model prompts.
(function (scope) {
  const list = [
    ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'], ['yue', 'Cantonese'],
    ['ja', 'Japanese'], ['ko', 'Korean'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
    ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'],
    ['cs', 'Czech'], ['nl', 'Dutch'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['he', 'Hebrew'],
    ['fa', 'Persian'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ur', 'Urdu'], ['mr', 'Marathi'],
    ['gu', 'Gujarati'], ['ta', 'Tamil'], ['te', 'Telugu'], ['th', 'Thai'], ['vi', 'Vietnamese'],
    ['id', 'Indonesian'], ['ms', 'Malay'], ['tl', 'Filipino'], ['km', 'Khmer'], ['my', 'Burmese'],
    ['bo', 'Tibetan'], ['kk', 'Kazakh'], ['mn', 'Mongolian'], ['ug', 'Uyghur'],
    ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'], ['fi', 'Finnish'], ['el', 'Greek'], ['hu', 'Hungarian'],
    ['ro', 'Romanian'], ['bg', 'Bulgarian'], ['hr', 'Croatian'], ['sr', 'Serbian'], ['sk', 'Slovak'], ['sl', 'Slovenian'],
    ['lt', 'Lithuanian'], ['lv', 'Latvian'], ['et', 'Estonian'], ['ca', 'Catalan'], ['sw', 'Swahili'], ['af', 'Afrikaans']
  ].map(([code, name]) => Object.freeze({ code, name }));
  const byCode = new Map(list.map(language => [language.code, language]));
  scope.SubtitleLanguages = Object.freeze({ list, defaultCode: 'zh-CN', get: code => byCode.get(code) || null });
})(globalThis);
