/* WetlandEar App: protection of sensitive locations. For some species the exact place of a record is the secret (nests of eagles, bustards, pelicans).
   When protection is on, exports and public pages show these species only with coordinates rounded to 0.1 degree (about 11 km); public pages hide them completely.
   The list below is a sensible default for the steppe and wetlands of Kazakhstan, not the official Red Book. A reserve can switch protection off for its own exports. */
(function () {
  'use strict';
  var KEY = 'we.privacy.v1';
  var SENSITIVE = ['Pelecanus crispus', 'Pelecanus onocrotalus', 'Grus leucogeranus', 'Otis tarda', 'Chlamydotis macqueenii', 'Tetrax tetrax', 'Falco cherrug', 'Falco peregrinus', 'Falco biarmicus',
    'Aquila heliaca', 'Aquila nipalensis', 'Aquila chrysaetos', 'Clanga clanga', 'Haliaeetus albicilla', 'Haliaeetus leucoryphus', 'Neophron percnopterus', 'Gyps fulvus', 'Aegypius monachus',
    'Gypaetus barbatus', 'Circaetus gallicus', 'Hieraaetus pennatus', 'Oxyura leucocephala', 'Aythya nyroca', 'Marmaronetta angustirostris', 'Vanellus gregarius', 'Glareola nordmanni',
    'Larus relictus', 'Ichthyaetus ichthyaetus', 'Larus ichthyaetus', 'Phoenicopterus roseus', 'Platalea leucorodia', 'Plegadis falcinellus', 'Ciconia nigra', 'Circus macrourus', 'Bubo bubo',
    'Tetraogallus altaicus', 'Anser erythropus', 'Branta ruficollis', 'Charadrius leschenaultii', 'Numenius tenuirostris'];
  var set = {}; SENSITIVE.forEach(function (s) { set[s.toLowerCase()] = 1; });
  function on() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  function setOn(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) { } }
  function sciOf(id) {
    var S = window.WEStore, s = S && S.species[id]; if (s) return s.lat;
    return (window.WE_SCI && window.WE_SCI[String(id).replace(/^x:/, '')]) || '';
  }
  function isSensitive(id) { return !!id && !!set[sciOf(id).toLowerCase()]; }
  function r1(x) { return x == null ? x : Math.round(x * 10) / 10; }
  /* returns [lat, lon] to publish for one record */
  function place(d) { return on() && isSensitive(d.species) ? [r1(d.lat), r1(d.lon)] : [d.lat, d.lon]; }
  window.WEPrivacy = { on: on, setOn: setOn, isSensitive: isSensitive, place: place, list: SENSITIVE, sciOf: sciOf };
})();
