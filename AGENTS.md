# Consignes pour les agents IA

Ces règles s'appliquent à tout le dépôt `SteeringBehavioursM2IA2_2026_2027_G2`. L'objectif est de développer des exemples pédagogiques autonomes de steering behaviors en JavaScript et p5.js, faciles à comprendre, à étendre et à tester.

## Avant de développer

1. Lire intégralement ce fichier et [ARCHITECTURE.md](ARCHITECTURE.md), puis les éventuelles consignes du sous-dossier concerné.
2. Examiner `git status`, les scripts chargés par `index.html`, le `vehicle.js` local et les tests existants. Préserver les modifications de l'utilisateur et les autres exercices.
3. Consulter les sections pertinentes de Craig W. Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999), dans [le PDF fourni](ARTICLE_CRAIG_REYNOLDS/Steering%20Behaviors%20For%20Autonomous%20Characters.pdf). La [version publiée par l'auteur](https://www.red3d.com/cwr/steer/gdc99/) permet aussi de consulter les illustrations.
4. Identifier le comportement demandé, ses paramètres, les unités et les critères d'acceptation avant de coder. Ne pas ajouter de fonctionnalités étrangères à l'exercice.

## Règle impérative : protéger les fichiers `vehicle.js`

**Ne modifier aucun fichier `vehicle.js` sans confirmation explicite préalable de l'utilisateur pour la modification concernée.** Cette protection couvre tout le fichier, y compris les autres classes qu'il peut contenir, ses commentaires, sa mise en forme et ses exemples incomplets.

- Ne pas corriger, reformater, renommer, déplacer, supprimer ou remplacer silencieusement un `vehicle.js` ; ne pas utiliser de monkey patch de son prototype pour contourner cette règle.
- Une demande générale de fonctionnalité ne constitue pas une autorisation de modifier la base. Si l'utilisateur a déjà autorisé précisément la modification concernée, ne pas redemander la même confirmation.
- Ajouter ou spécialiser les comportements **dans des sous-classes de la classe `Vehicle` locale**, dans de nouveaux fichiers. Réutiliser les méthodes existantes via l'héritage et `super` lorsqu'elles conviennent ; ne pas copier intégralement la classe de base.
- Si la base contient une limitation ou un comportement incomplet, le signaler et implémenter la variante dans une sous-classe. Si une modification de la base est réellement indispensable, expliquer le fichier et le changement nécessaires, puis attendre la confirmation avant de toucher à ce fichier. Continuer les parties indépendantes du travail.
- Avant livraison, vérifier que les fichiers protégés n'ont pas été modifiés par le travail de l'agent. Si l'utilisateur avait déjà des modifications, les conserver telles quelles : ne pas les restaurer depuis Git.

## Règle impérative : toute entité graphique mobile est un Vehicle

Tout objet visible qui peut se déplacer dans la simulation doit être une instance de
`Vehicle` ou d'une sous-classe de `Vehicle`. Il utilise la locomotion héritée
(`applyForce()`, `update()`, `edges()`) et un steering behavior pour diriger son
mouvement. Une cible mobile n'est jamais un simple objet de coordonnées déplacé
directement par la scène.

- Une cible spécialisée étend la classe `Target` locale, qui elle-même étend
  `Vehicle`, dans un fichier dédié portant le nom de l'entité, par exemple
  `targetFuyante.js` pour `TargetFuyante`.
- La sous-classe réutilise ou surcharge les comportements de `Vehicle` et appelle
  `super.update()` une seule fois ; elle ne recopie pas l'intégration de position et
  de vitesse dans `sketch.js`.
- Les forces de fuite, poursuite ou évitement sont calculées comme des steering
  behaviors. Les positions ne sont pas téléportées pour simuler un déplacement, sauf
  pour une règle de scène explicitement documentée comme une réapparition.
- Les éléments immobiles de l'interface et le décor peuvent rester du HTML ou du
  rendu p5.js. Cette exception ne s'applique pas à une entité qui se déplace dans le
  monde simulé.

## Steering selon Reynolds

Respecter trois responsabilités : **sélection d'action** (choisir l'objectif), **steering** (calculer une force) et **locomotion** (appliquer la force et intégrer le mouvement).

- Utiliser `p5.Vector` pour positions, vitesses, accélérations et forces. Un comportement retourne une force et ne téléporte pas l'entité.
- Pour `seek`, la direction est `targetPosition - position`, la vitesse désirée est orientée vers la cible, et `steering = desiredVelocity - currentVelocity`. Limiter la force selon `maxForce`.
- Appliquer les forces avec `applyForce()` et réutiliser la locomotion fournie. Ne pas intégrer position/vitesse une deuxième fois dans la sous-classe ou dans `sketch.js`.
- Pour un nouveau `flee`, construire une vitesse désirée orientée à l'opposé de la cible, puis soustraire la vitesse courante. Inverser une force `seek` déjà calculée n'est pas en général équivalent lorsque le véhicule se déplace.
- Distinguer `seek` d'`arrive` : ralentir progressivement dans une zone définie pour une arrivée, avec seuil d'arrêt documenté et gestion de la vitesse résiduelle.
- Pour `pursue` et `evade`, prédire une position future avec la vitesse de la cible et un horizon borné. Gérer une vitesse nulle sans division par zéro.
- Pour `wander`, conserver un état de direction perturbé progressivement ; ne pas tirer une destination indépendante à chaque image.
- Séparer séparation, alignement et cohésion pour le flocking. Exclure l'entité elle-même du voisinage et gérer voisins absents ou superposés.
- Documenter perception, rayons, distances de freinage, horizon de prédiction, poids et priorités. Les paramètres doivent avoir un sens pour l'exemple.
- Composer explicitement les forces dans la sous-classe : somme pondérée ou priorités selon le besoin. Limiter la force finale après pondération, avant application, pour ne pas dépasser le budget prévu. Une somme pondérée peut annuler des forces opposées ; tester les cas où une priorité d'évitement est nécessaire.
- Préserver les vecteurs de la cible et des voisins : utiliser des copies ou les opérations statiques appropriées. Éviter les valeurs non finies, les normalisations indéfinies et les boucles de recherche aléatoire non bornées.
- Les réapparitions, collisions, conditions de bord et cycles de vie sont des règles explicites de scène ; elles restent distinctes des comportements de direction. Ne pas supposer qu'un rebouclage visuel rend automatiquement le steering torique.

## Organisation du code

- Une nouvelle entité autonome = une sous-classe = un fichier : par exemple `Enemy` dans `enemy.js`, `Missile` dans `missile.js`, `Obstacle` dans `obstacle.js`. Ne pas regrouper ces nouvelles classes dans `vehicle.js` ou `sketch.js`.
- Une entité représentée par un véhicule mais immobile, telle qu'un obstacle, peut étendre `Vehicle` sans appeler sa locomotion. L'interface et les éléments décoratifs ne sont pas des véhicules.
- Garder chaque exemple autonome dans son sous-dossier. Ne pas partager implicitement une base `Vehicle` avec un autre exercice : les signatures et comportements diffèrent.
- `sketch.js` initialise la scène, recueille les entrées, orchestre une mise à jour par entité et dessine. Les sous-classes portent les comportements spécialisés. Les aides mathématiques pures peuvent être séparées, sans remplacer cette extension par héritage.
- Charger p5, la base, les sous-classes puis `sketch.js` dans cet ordre. Éviter les collisions de noms avec des classes déjà déclarées, notamment `Target` dans certains `vehicle.js`.

## Bonnes pratiques JavaScript et p5.js

Les règles ci-dessous sont les conventions du dépôt, éclairées par les ressources officielles listées plus bas. Le guide de contribution à la bibliothèque p5.js n'impose pas à ces exercices son workflow GitHub.

- Écrire du code lisible pour des étudiants : noms explicites, petites méthodes, `const` par défaut et `let` pour les variables réaffectées, aucune globale implicite. Conserver le style local ; pour les nouveaux fichiers, utiliser une indentation de deux espaces.
- Initialiser canvas, contrôles, entités et écouteurs une seule fois dans `setup()` ou dans une initialisation dédiée. Utiliser le mécanisme de chargement d'assets compatible avec la version embarquée, notamment `preload()` en p5.js 1.x. Ne pas créer de DOM, de timers ou de nouvelles instances p5 à chaque `draw()`.
- Respecter le mode global déjà présent. Utiliser le mode instance si plusieurs sketches doivent cohabiter, uniquement dans le périmètre demandé ; ne pas migrer tous les exemples pour une petite fonctionnalité.
- Inspecter la version des fichiers `libraries/p5*.js` avant de choisir une API. `1-Seek` embarque initialement p5.js 1.7.0. Ne pas modifier les bibliothèques minifiées ni les mettre à jour sans nécessité et validation de compatibilité.
- Comprendre les mutations de `p5.Vector` : `.add()`, `.sub()`, `.mult()` sur une instance modifient généralement cette instance. Préférer `copy()` ou les méthodes statiques pour préserver les entrées. Ne pas transmettre un objet entité à une méthode qui attend son vecteur `pos`.
- Isoler styles et transformations de chaque nouveau rendu avec `push()` / `pop()`. Ne pas laisser `colorMode()`, `angleMode()`, `translate()` ou `rotate()` modifier involontairement les autres dessins, y compris ceux de la base protégée.
- Conserver les unités du modèle local. Les exemples fournis intègrent souvent le mouvement par image. `frameRate(60)` ne garantit pas un pas constant ; ne pas multiplier arbitrairement par `deltaTime` une force déjà intégrée par la base. Toute variante temporelle exige une conception et des tests cohérents, sans toucher à `vehicle.js` sans autorisation.
- Pour un contrôle devant réagir pendant un glissement, traiter `input`, mettre à jour le paramètre et son affichage immédiatement. Associer un libellé au contrôle, prévoir le clavier et convertir les coordonnées du pointeur dans le repère du canvas.
- Prévoir des descriptions du canvas avec `describe()` lorsque disponible, des commandes lisibles et un contraste adapté. La couleur seule ne doit pas porter une information essentielle.
- Nettoyer les écouteurs, timers et ressources créés par une nouvelle fonctionnalité. Pour l'audio, respecter l'activation par interaction utilisateur et tester que l'arrêt coupe tout le mix et libère les sources.
- Éviter les calculs ou allocations inutiles dans `draw()` ; ne pas introduire de framework, moteur physique ou chaîne de build lourde pour ces petits exemples.

## Tests obligatoires et livraison

**Chaque nouvelle fonctionnalité doit avoir des tests unitaires pertinents. Ne proposer à l'utilisateur de tester que lorsque tous les tests de validation concernés ont été exécutés et sont passés.** Une capture d'écran, un changement de libellé ou une vérification de syntaxe ne remplace pas ces tests.

1. Réutiliser le lanceur présent. S'il n'existe pas, ajouter un dispositif léger dans l'exemple, avec une commande reproductible et documentée. À l'état initial, `1-Seek/test.js` est un commentaire, pas une suite exécutable ; aucun lanceur global n'est configuré.
2. Une option sans dépendance de test supplémentaire est `node:test` avec `node:assert/strict` (Node.js 18+), dans `tests/*.test.mjs`. La commande `node --test tests/*.test.mjs`, lancée depuis l'exemple, ne devient valable qu'après création de ces fichiers et de leur chargement compatible avec le code testé.
3. Tester les vraies méthodes de la sous-classe, les méthodes de base qu'elle réutilise et leurs effets observables. Ne pas recopier l'algorithme dans les tests ni se limiter à vérifier les appels de fonctions.
4. Couvrir direction et grandeur des forces, limites `maxForce` / `maxSpeed`, composition, proximité et éloignement, cible confondue avec l'entité, vitesse nulle, seuils exacts, entrées invalides et absence de mutation des vecteurs partagés, selon la fonctionnalité.
5. Injecter un générateur aléatoire ou utiliser une graine fixe ; rendre l'horloge et les entrées contrôlables. Éviter les tests dont le succès dépend d'un délai réel imprévisible ou du hasard.
6. Pour une fonctionnalité de scène, ajouter les tests adaptés : variation d'effectif, identité conservée, collisions/rayons, bords, événements `input`, nettoyage et réinitialisations. Ne pas imposer des tests sans rapport avec le changement.
7. Pour les tests sans navigateur, utiliser si nécessaire un adaptateur minimal p5 clairement identifié. Il ne prouve pas la compatibilité avec p5 réel : compléter les changements interactifs, graphiques ou audio par une validation d'intégration dans le navigateur. Mesurer le résultat réel lorsque nécessaire, par exemple le signal audio après arrêt.
8. Exécuter toutes les suites pertinentes après la dernière modification, corriger les échecs et vérifier les régressions connues. Un test ignoré, bloqué ou non exécuté n'est pas un succès. En cas de blocage, le signaler sans présenter le travail comme validé ni transférer à l'utilisateur la responsabilité de tester.
9. Livrer les fichiers concernés, le comportement obtenu, les commandes de tests et leurs résultats, les limites restantes et la confirmation que les bases protégées n'ont pas été altérées par l'agent. Documenter les paramètres et commandes dans le README local.

Une modification exclusivement documentaire ne nécessite pas d'inventer des tests de comportement. Vérifier alors les liens, la cohérence des consignes et le diff, et indiquer qu'aucun code n'a changé.

## Références p5.js consultées

Ressources officielles vérifiées le 12 octobre 2026 ; consulter la documentation correspondant à la version réellement utilisée.

- [Documentation Style Guide](https://p5js.org/contribute/documentation_style_guide/) : guide de style pour la documentation et les exemples p5.js ; source de conventions de lisibilité, à adapter à ces exercices.
- [Contributor Guidelines](https://p5js.org/contribute/contributor_guidelines/) : principes pédagogiques, accessibilité, tests et standard de code contrôlé par ESLint pour la bibliothèque elle-même.
- [p5.Vector](https://p5js.org/reference/p5/p5.Vector/) et [push()/pop()](https://p5js.org/reference/p5/push/) : vecteurs, copies et isolation du rendu.
- [deltaTime](https://p5js.org/reference/p5/deltaTime/), [input()](https://p5js.org/reference/p5.Element/input/) et [describe()](https://p5js.org/reference/p5/describe/) : temps, interactions et description accessible du canvas.

Les règles d'héritage, de protection des bases et de validation avant essai utilisateur sont des exigences locales de ce dépôt, pas des citations du guide p5.js.

## Entités graphiques et scénarios : directives complémentaires

- Toute entité graphique du monde simulé est un `Vehicle` ou une sous-classe, même lorsqu'elle est initialement immobile (nourriture, obstacle, cible, leurre). Les boutons, curseurs, fonds et dessins de diagnostic restent de l'interface ou du rendu, pas des entités du monde.
- Tout déplacement autonome est piloté par des steering behaviors, via les forces et la locomotion héritées. Ne pas déplacer une entité en modifiant directement sa position à chaque image. Les réapparitions et les entrées directement pilotées par le pointeur sont des règles de scène distinctes et documentées.
- Une cible fuyante réutilise le comportement `flee()` hérité : appeler `super.flee(threat.pos)` lorsque le contrat le permet, puis `applyForce()`. Ne pas recoder la formule de fuite dans le contrôleur de scène.
- Pour une sélection de scénarios, préserver le comportement du scénario existant, isoler l'état de chaque scénario et afficher uniquement les paramètres pertinents. Un changement de scénario réinitialise proprement la fuite, l'endurance et les références aux menaces.
- Distinguer rayon de déclenchement et distance de sortie. Lorsqu'une menace quitte le rayon de déclenchement, continuer à mesurer sa distance réelle jusqu'au seuil de sortie ; l'absence de menace dans le premier rayon ne prouve pas que le second est atteint.
- Une fuite limitée dans le temps doit restaurer les paramètres normaux à la sortie ou à l'épuisement. Éviter qu'elle se réactive à l'image suivante et contourne sa durée maximale ; documenter la condition de réarmement.
- Le debug lit les données de perception et de comportement existantes : ne pas relancer le calcul d'une force pour dessiner. Tester les seuils exacts, le choix du prédateur le plus proche, la durée, la restauration des limites, les transitions de scénario et la synchronisation touche/case debug.

---

# Projet Neuro Racing — consignes spécifiques

Cette section **s'ajoute** aux règles ci-dessus ; elle ne les remplace pas. Les règles précédentes ont été écrites pour les exercices de *steering behaviors* (`1-Seek`, `4-Wander`, `vehicle.js`, `sketch.js`, p5.js 1.7.0). Le projet **Neuro Racing** (neuroévolution de voitures autonomes) est l'application du dossier `Conduite Évolutive/`. Pour tout travail dans ce dossier, appliquer d'abord cette section ; en cas de contradiction avec une règle générale ci-dessus, **cette section l'emporte pour Neuro Racing**, et les règles générales continuent de s'appliquer aux exercices de steering.

## NR-1. Documents à lire avant de coder

1. `Conduite Évolutive/ARCHITECTURE.md` : organisation réelle du code, flux, formats, invariants (document de référence du projet).
2. `Conduite Évolutive/SPECIFICATION.md` : plan en 61 tâches numérotées ; chaque tâche a un critère d'acceptation et les tests qui la couvrent.
3. `README.md` (rapport, réglages, protocole) et `Conduite Évolutive/analyse.md` (fitness, expérimentation, limites).
4. Le code et les tests réels. Le code fait foi si un document diverge ; dans ce cas, corriger le document.

> Le dossier s'appelle `Conduite Évolutive` (accent et espace). Dans certaines extractions de ZIP il apparaît sous la forme `Conduite #U251c#U00ebvolutive` : c'est un artefact d'encodage. Toujours entourer le chemin de guillemets en ligne de commande.

## NR-2. Adaptation des règles générales à ce projet

| Règle générale ci-dessus | Dans Neuro Racing |
|---|---|
| `vehicle.js` protégé | Le fichier est `js/Vehicle.js` (V majuscule). **La protection s'applique à lui aussi** : ne pas le modifier sans confirmation explicite. C'est la couche « locomotion » (`applyForce`, `update`) ; elle intègre la force une seule fois par pas. Toute capacité de voiture s'ajoute dans `Car` (sous-classe) ou dans un nouveau fichier. |
| Une entité mobile est un `Vehicle` | Les voitures sont des `Car extends Vehicle`. Le réseau ne produit que des **commandes** (cap et poussée) converties en force de steering (`desiredVel − vel`, limitée à `maxForce`) puis `applyForce()`. Aucune position n'est jamais écrite directement. Les effets visuels (`Effects.js`) ne sont pas des entités du monde : ils ne se déplacent pas dans la simulation et n'interagissent avec rien. |
| Une entité = une sous-classe = un fichier | Un fichier par responsabilité dans `js/` (voir `ARCHITECTURE.md` §2). Un nouveau module est inséré dans `index.html` avant les scripts qui l'utilisent ; `main.js` reste **le dernier** chargé. |
| `sketch.js` orchestre | Dans ce projet, c'est `main.js` (`setup`, `draw`, pas de simulation, interface, éditeur, course). Ne pas y ajouter de logique métier réutilisable : la placer dans le module concerné. |
| Chaque exemple est autonome | `Conduite Évolutive/` est autonome ; ne pas dépendre des autres dossiers du dépôt. |
| p5.js 1.7.0 embarqué | Ici p5.js **1.9.0** et TensorFlow.js **4.20.0**, chargés par CDN jsDelivr. Pas de bundler, pas de modules ES, pas de paquet npm pour exécuter l'application. |
| Tests `tests/*.test.mjs` | Ici `tests/*.test.cjs` avec `node:test` et `node:vm` ; un lanceur existe déjà (voir NR-5). Ne pas introduire un second dispositif. |
| `deltaTime` interdit sur les forces déjà intégrées | Tout est exprimé **par pas de simulation**, jamais en secondes ni avec `deltaTime`. Les seuils (60, 120, 1 200 pas…) sont des pas ; les durées affichées se convertissent avec `RACE_FPS = 60`. |

## NR-3. Invariants à ne jamais casser

1. **Le réseau ne touche pas aux règles du monde.** Collisions (`checkCollisions`), validation des checkpoints, sens inverse, tour complet et élimination restent des règles explicites (`Car.checkCheckpoints`, `main.checkCollisions`, `Car.update`).
2. **Une seule intégration physique par pas** : `Vehicle.update()` est appelée une fois par voiture et par pas ; `Car.update()` délègue via `super.update()`.
3. **Ordre d'un pas d'entraînement** : `think` → `update` → `updateTrackProgress` → `checkCheckpoints` → `checkCollisions`. Ne pas le réordonner sans mettre à jour les tests et `ARCHITECTURE.md` §6.1.
4. **Hasard reproductible** : tout tirage qui influence la simulation (poids initiaux, mutation, croisement, tournoi, décalage de départ) passe par `Random.js` (`randomUnit`, `randomBetween`, `randomIndex`, `randomGaussianValue`, `nextInitSeed`). Jamais `Math.random()` ni `random()` de p5 dans la simulation. Ajouter un tirage décale tous les suivants : cela invalide les expériences déjà notées par graine, il faut le signaler. Les identifiants d'archive et les effets (`Effects.js`, générateur local) restent hors flux.
5. **Mémoire TensorFlow** : toute `Car` ou tout `NeuralNetwork` qui quitte la simulation est libéré par `dispose()` (`nextGeneration`, `restartTraining`, `startBrainRace`, `exitBrainRace`, `respawnOnCurrentTrack`). Les calculs intermédiaires passent par `tf.tidy`. `copy()` et `fromJSON()` n'initialisent pas depuis le flux aléatoire.
6. **Validation aux frontières** : tout ce qui vient de l'extérieur (`localStorage`, fichier importé) est validé (`validateRecord`, `NeuralNetwork.validateJSON`, `sanitizeSetting`, `sanitizeSoundPrefs`) ; les erreurs sont montrées à l'utilisateur par `setStatus(..., true)`, jamais ignorées. Un stockage bloqué ou plein ne doit jamais planter l'application.
7. **Un seul point d'écriture de l'archive** : `BrainStorage.commit()`. `save`, `importJSON` et `repair` n'écrivent jamais directement. Ne pas ajouter d'écriture directe sur la clé `neuroevolution-racing-brains-v1`.
8. **Un seul point de réinitialisation** : `restartTraining(message)` (archive les meilleurs cerveaux qui ont progressé, libère, recrée, remet à zéro, réapplique la graine, remet `multiTrackRound` à 0).
9. **Un seul endroit construit une génération** : `buildNextPopulation()` (élites sans mutation, puis `createChild()`). `nextGeneration()` et `continueTrainingFromArchive()` l'appellent tous deux.
10. **DOM sans `innerHTML`** pour les données variables (nom de cerveau importé, HUD, liste, diagramme) : `createElement` et `textContent`.
11. **Son et effets sont du pur décor** : aucun effet sur les entrées, les poids, la graine ou la décision ; le son n'est créé qu'après un geste de l'utilisateur ; désactiver le son coupe tout le mix.
12. **Le mode debug ne lit que des valeurs déjà calculées** (`ray.distance`, `ray.end`) et ne change rien à l'apprentissage.
13. **Circuits** : `setupTrack(preset)` construit n'importe quel circuit sans modifier `TRACK_PRESET` ; `trainingPreset()` donne le circuit sur lequel l'entraînement tourne ; `currentTrackPreset` est le circuit réellement dessiné.
14. **Fitness** : le score affiché (checkpoints) et la fitness de sélection sont deux choses. Modifier `scoreCarFitness` exige d'adapter `fitness-progress.test.cjs` et de relire `analyse.md`, car elle sert aussi à choisir le leader.

## NR-4. Conventions de code propres au projet

- Scripts classiques et portée globale ; `var` dans `globals.js` (lisible via `window` et manipulable par les tests `vm`), `const`/`let` ailleurs. Ne pas migrer vers des modules ES.
- Indentation de 4 espaces et fins de ligne CRLF dans les fichiers existants : conserver le style local de chaque fichier (le présent fichier et `ARCHITECTURE.md` sont en CRLF).
- Toute nouvelle valeur de réglage : variable dans `globals.js`, contrôle dans `index.html`, liaison dans `bindControls`, entrée dans `SETTING_DEFINITIONS` (`Settings.js`) si elle doit survivre au rechargement, et décision explicite : appelle-t-elle `restartTraining` ? Les valeurs initiales de `globals.js` et de la page doivent rester identiques (`defaults.test.cjs`).
- Nouvelle clé `localStorage` : préfixe `neuroevolution-racing-` ou `neuroRacing`, lecture tolérante, écriture sans exception si le quota est refusé. Changer la forme d'un cerveau (entrées, sorties) rend les archives incompatibles : incrémenter la clé de stockage et le dire.
- Interface en **français**, accessible : `<label for>` sur chaque curseur, `aria-expanded` / `aria-controls` sur les panneaux, `aria-live` sur le HUD et les messages, `aria-label` sur les graphiques, `describe()` sur le canvas. La couleur ne porte jamais seule une information (ex. « connu » / « inédit » écrit en toutes lettres).
- Les dessins isolent leurs styles par `push()` / `pop()`. Le décor fixe est peint une fois dans `trackLayer` et seulement recopié à chaque image ; ne pas le repeindre à chaque image.
- Éviter allocations et DOM dans `draw()` : HUD toutes les 6 images, diagramme réseau toutes les 15 images et seulement si son panneau est ouvert, classement de course toutes les 6 images.
- Commentaires en français, expliquant le *pourquoi* (règle de simulation, choix de seuil), comme dans le code existant.

## NR-5. Tests : obligatoires et reproductibles

Commande unique, à lancer depuis `Conduite Évolutive/` après la **dernière** modification :

```bash
cd "Conduite Évolutive"
node --test tests/*.test.cjs
```

Dernier état constaté : **246 tests dans 23 fichiers, 246 réussis, 0 échec, 0 ignoré** (Node.js 18 ou plus, aucune dépendance npm).

- Les tests chargent les **vrais** fichiers de `js/` dans un contexte `node:vm` via `tests/helpers.cjs` (`createContext`, `loadScripts`), avec des substituts de p5 (`TestVector`, `createVector`, `map`…), de TensorFlow.js, du stockage et du DOM. Ne pas recopier un algorithme dans un test.
- Toute nouvelle fonctionnalité a ses tests dans `tests/<sujet>.test.cjs`. Tester l'effet observable : limites `maxSpeed` / `maxForce`, cas limites (population vide, une seule voiture, valeurs non finies, stockage refusé), absence de mutation des entrées, libération des cerveaux, seuils exacts.
- Hasard : rendre les tests déterministes (graine fixe ou injection), jamais de dépendance à un délai réel.
- Un script ajouté à `index.html` doit aussi être pris en compte par les tests de chargement (`multi-track-settings.test.cjs` vérifie l'ordre des scripts).
- Les tests ne remplacent pas une validation dans un navigateur réel (rendu p5, CDN, audio, `localStorage`) ni la mesure de la **qualité d'apprentissage** ; ne pas annoncer un taux de réussite ou un temps de convergence sans mesure. Le dire dans la livraison.
- Ne proposer à l'utilisateur d'essayer qu'une fois la suite complète verte. Un test ignoré, bloqué ou non exécuté n'est pas un succès.
- Une modification purement documentaire n'exige pas de nouveaux tests : vérifier la cohérence avec le code, les liens et le diff, et indiquer qu'aucun code n'a changé.

## NR-6. Méthode pour ajouter ou modifier une fonctionnalité

1. Retrouver la tâche concernée dans `SPECIFICATION.md` (ou en créer une nouvelle numérotée à la suite, avec objectif, travail réalisé et critère d'acceptation).
2. Identifier le module propriétaire (voir `ARCHITECTURE.md` §4 et §14, « Comment étendre le projet »). Ne pas faire grossir `main.js` si un module dédié convient.
3. Coder, puis écrire ou adapter les tests, puis lancer toute la suite.
4. Mettre à jour **dans le même changement** : `ARCHITECTURE.md` (module, flux, tableau des tests), `SPECIFICATION.md` (statut et nombre de tests), `README.md` (réglages, plages, valeurs initiales) et, si la fitness ou le protocole changent, `analyse.md`.
5. Livrer : fichiers modifiés, comportement obtenu, commande de test et résultat réel, limites restantes, et confirmation que `js/Vehicle.js` n'a pas été modifié (ou sur quelle autorisation).

## NR-7. À éviter

- Modifier `js/Vehicle.js`, introduire `deltaTime` ou des secondes dans la physique.
- Faire décider au réseau des collisions, des checkpoints ou de la fin de tour.
- Utiliser `Math.random()` ou `random()` de p5 dans la simulation ; consommer le flux aléatoire dans un effet visuel ou sonore.
- Oublier `dispose()` sur un cerveau abandonné, ou écrire dans l'archive sans passer par `commit()`.
- Construire du HTML avec `innerHTML` à partir d'un nom de cerveau ou d'un fichier importé.
- Changer le nombre d'entrées (`NB_ASSETS`) ou de sorties sans traiter la compatibilité de l'archive.
- Ajouter une dépendance, un bundler ou une étape de compilation : l'application doit rester exécutable par un simple serveur HTTP statique (`python -m http.server 8000`).
- Supprimer les écarts connus du code ou de la documentation au lieu de les consigner (`ARCHITECTURE.md` §15).
