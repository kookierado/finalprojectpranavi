// channels.js: the Live TV channel list.
// Add, remove or reorder channels here. The order is the channel number (CH 01, CH 02, ...).
//
//   name     full name, shown in the player
//   short    shorter name, used on pins and keys where space is tight
//   handle   the channel's @handle on YouTube, used for the "Open on YouTube" link
//   youtube  the channel's ID (starts with UC). YouTube's embedded player needs the ID, not the @handle
//   country  3 letter code the globe uses (same codes as the chat rooms). null = no single home country
//   place    country name shown as "Live from ..."
//   lat/lng  where the channel's pin sits on the globe
//   group    channels with the same group share one pin (so Europe's pins don't pile on top of each other)

const CHANNELS = [
  { name: 'BBC News',           short: 'BBC News',      handle: '@BBCNews',           youtube: 'UC16niRr50-MSBwiO3YDb3RA', country: 'GBR', place: 'United Kingdom', lat: 54.0,  lng: -2.0,  group: 'Europe' },
  { name: 'Sky News',           short: 'Sky News',      handle: '@SkyNews',           youtube: 'UCoMdktPbSTixAyNGwb-UYkQ', country: 'GBR', place: 'United Kingdom', lat: 54.0,  lng: -2.0,  group: 'Europe' },
  { name: 'Al Jazeera English', short: 'Al Jazeera',    handle: '@aljazeeraenglish',  youtube: 'UCNye-wNBqNL5ZzHSJj3l8Bg', country: 'QAT', place: 'Qatar',          lat: 25.3,  lng: 51.2 },
  { name: 'DW News',            short: 'DW News',       handle: '@dwnews',            youtube: 'UCknLrEdhRCp1aegoMqRaCZg', country: 'DEU', place: 'Germany',        lat: 51.1,  lng: 10.4,  group: 'Europe' },
  { name: 'France 24',          short: 'France 24',     handle: '@France24_en',       youtube: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', country: 'FRA', place: 'France',         lat: 46.6,  lng: 2.4,   group: 'Europe' },
  { name: 'Euronews',           short: 'Euronews',      handle: '@euronews',          youtube: 'UCSrZ3UV4jOidv8ppoVuvW9Q', country: null,  place: 'Europe',         lat: 50.8,  lng: 4.4,   group: 'Europe' },
  { name: 'TRT World',          short: 'TRT World',     handle: '@trtworld',          youtube: 'UC7fWeaHhqgM4Ry-RMpM2YYw', country: 'TUR', place: 'Turkey',         lat: 39.0,  lng: 35.0 },
  { name: 'WION',               short: 'WION',          handle: '@WION',              youtube: 'UC_gUM8rL-Lrg6O3adPW9K1g', country: 'IND', place: 'India',          lat: 22.0,  lng: 79.0 },
  { name: 'CNA',                short: 'CNA',           handle: '@channelnewsasia',   youtube: 'UC83jt4dlz1Gjl58fzQrrKZg', country: 'SGP', place: 'Singapore',      lat: 1.35,  lng: 103.8 },
  { name: 'NHK World-Japan',    short: 'NHK World',     handle: '@NHKWORLDJAPAN',     youtube: 'UCSPEjw8F2nQDtmUKPFNF7_A', country: 'JPN', place: 'Japan',          lat: 36.5,  lng: 138.5 },
  { name: 'ABC News Australia', short: 'ABC Australia', handle: '@abcnewsaustralia',  youtube: 'UCVgO39Bk5sMo66-6o6Spn6Q', country: 'AUS', place: 'Australia',      lat: -25.0, lng: 134.0 },
];
