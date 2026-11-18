# MyMeteo Mobile

Application météo mobile dédiée, optimisée pour les écrans tactiles et les appareils portables.

## Architecture

L'architecture technique est identique au repository **MyMeteo** :
- **Frontend** : HTML5, CSS3, JavaScript ES6+
- **Backend** : Supabase (PostgreSQL via API REST)
- **Librairies** : Aucune dépendance externe (pas de Chart.js, pas de framework)

## Structure

```
MyMeteoMobile/
├── index.html          # Page principale de l'application
├── styles.css          # Styles CSS mobile-first
├── app.js              # Logique métier et connexion Supabase
└── README.md           # Documentation
```

## Fonctionnalités

### Écran d'accueil

1. **Dernier relevé** (table MyMeteoData)
   - Horodatage
   - Température
   - Quantité de pluie de la dernière heure (Hourly Rain)
   - Pression
   - UV
   - Rafale

2. **Boutons de période**
   - Aujourd'hui (données brutes de MyMeteoData)
   - Hier (indicateurs DailyIndicators)
   - 7 derniers jours (indicateurs DailyIndicators)
   - 30 derniers jours (indicateurs DailyIndicators)
   - Années (liste des années disponibles, excluant 2022)

3. **Affichage des données**
   - Tableau des indicateurs pour la période sélectionnée
   - Résumé avec les valeurs agrégées
   - Toutes les périodes (sauf Aujourd'hui) affichent :
     - Température min/max/moy
     - Cumul des précipitations
     - Rafale maximum
     - UV Max
     - Pression Min/Max

### Design

- **Mobile-first** : Optimisé pour les petits écrans
- **Thumb-friendly** : Boutons assez grands pour être utilisés au pouce
- **Sans graphiques** : Uniquement des valeurs encadrées et des tableaux
- **Design moderne** : Couleurs sombres avec accents cyan/vert
- **Responsive** : S'adapte à toutes les tailles d'écran
- **PWA-ready** : Compatible avec les fonctionnalités d'application web progressive

### Couleurs

- Fond primaire : `#0a0a14` (noir profond)
- Fond secondaire : `#1a1a2e` (bleu nuit)
- Fond cartes : `#161628`
- Accent cyan : `#00d4ff`
- Accent vert : `#00ff88`
- Texte principal : `#ffffff`
- Texte secondaire : `#b0b0c0`

## Configuration

L'application se connecte à la base de données Supabase suivante :
- URL : `https://gvmogpbbcllkfqmryvwz.supabase.co`
- Tables utilisées :
  - `MyMeteoData` (données brutes)
  - `DailyIndicators` (indicateurs journaliers pré-calculés)

## Utilisation

### Déploiement local

1. Ouvrir le fichier `index.html` dans un navigateur web
2. L'application se connectera automatiquement à Supabase
3. Les données seront chargées automatiquement

### Sur mobile

1. Ouvrir l'application dans un navigateur mobile
2. Ajouter à l'écran d'accueil pour une expérience native
3. Fonctionne hors ligne (avec données en cache)

### Gestes tactiles

- **Swipe down** (en haut de la page) : Rafraîchir les données
- **Tap** sur les boutons : Sélectionner une période

### Raccourcis clavier

- **F5** ou **Ctrl+R** : Rafraîchir les données

## Données affichées

### Dernier relevé
Données en temps réel depuis la table MyMeteoData :
- Date et heure du relevé
- Température (°C)
- Humidité (%)
- Pression atmosphérique (hPa)
- Rafale de vent (km/h)
- Indice UV
- Pluie horaire (mm)

### Indicateurs par période

Pour chaque période sélectionnée (sauf Aujourd'hui) :

| Métrique | Unité | Source |
|----------|-------|--------|
| Temp. Min | °C | DailyIndicators |
| Temp. Moy | °C | DailyIndicators |
| Temp. Max | °C | DailyIndicators |
| Pluie Total | mm | DailyIndicators |
| Pression Min | hPa | DailyIndicators |
| Pression Max | hPa | DailyIndicators |
| Rafale Max | km/h | DailyIndicators |
| UV Max | - | DailyIndicators |

## Compatibilité

- **Navigateurs** : Chrome, Safari, Firefox, Edge (dernières versions)
- **Appareils** : Smartphones, tablettes, ordinateurs
- **Systèmes** : iOS, Android, Windows, macOS, Linux

## Accessibilité

- Contrastes élevés pour une bonne lisibilité
- Tailles de touche adaptées pour le tactile
- Navigation au clavier supportée
- Réduction du mouvement supportée (prefers-reduced-motion)

## Optimisations

- **Performance** : Chargement paginé des données
- **Réseau** : Appels API optimisés
- **Cache** : Données mises en cache pour un chargement plus rapide
- **Mobile** : Design optimisé pour les connexions lentes

## Développement

### Prérequis

Aucun prérequis spécifique. L'application fonctionne directement dans le navigateur.

### Pour contribuer

1. Forker le repository
2. Créer une branche de fonctionnalité
3. Commiter les changements
4. Pousser vers la branche
5. Créer une Pull Request

## Auteur

Vincent RIONDET

## Licence

Application personnelle - Tous droits réservés

---

*Application créée le 28/12/2026*
