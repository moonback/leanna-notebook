# Référence technique — OpenRouter et Google Nano Banana

> Vérification documentaire : 11 novembre 2026. Les tarifs et disponibilités évoluent ; le catalogue et les endpoints API doivent être interrogés avant chaque release. Les valeurs ci-dessous sont celles visibles dans les fiches OpenRouter consultées à la date de vérification.

## 1. Slugs vérifiés dans les fiches OpenRouter

| Nom produit | Slug OpenRouter | État documentaire |
|---|---|---|
| Nano Banana 2 (Gemini 3.1 Flash Image) | `google/gemini-3.1-flash-image` | Fiche active consultée |
| Nano Banana 2.1 | `google/gemini-nano-banana-2.1` | Fiche active consultée |
| Nano Banana Pro (Gemini 3 Pro Image) | `google/gemini-3-pro-image` | Fiche active consultée |

Les noms marketing « Nano Banana 2 » et « Nano Banana 2.1 » ne doivent pas être utilisés comme slugs. Les slugs ci-dessus sont les identifiants API exacts relevés sur les pages OpenRouter.

## 2. Capacités comparées

| Modèle | Entrée/sortie documentée | Contexte | Prix affiché sur la fiche consultée |
|---|---|---:|---|
| Nano Banana 2 | Texte + image / texte + image | 131K | $0.50/M input, $60/M output |
| Nano Banana 2.1 | Texte + image / texte + image | 66K | $1.50/M input, $30/M output ; ligne image output affichée à $30/M |
| Nano Banana Pro | Texte + image / texte + image | 131K sur fiche principale | $2/M input, $12/M output texte ; image output affichée à $120/M |

Attention : les prix par token d'image et les prix de tokens texte ne sont pas interchangeables. La facturation réelle peut dépendre de l'endpoint/provider et de la résolution. Le coût final retourné dans `usage.cost` doit être la référence de coût fournisseur lorsqu'il est fourni.

### Nano Banana 2

Slug : `google/gemini-3.1-flash-image`.

- Positionnement : génération et édition rapide, bonne qualité générale.
- Fiche OpenRouter : génération d'images, édition itérative, ratios via paramètre `image_config`.
- Modalités : texte et image en entrée ; texte et image en sortie.
- Prix de fiche consulté : $0.50/M entrée et $60/M sortie.
- Recommandation : meilleur candidat par défaut pour un MVP si le catalogue Images API confirme son endpoint et ses paramètres.

### Nano Banana 2.1

Slug : `google/gemini-nano-banana-2.1`.

- Positionnement : édition avancée, cohérence, photoréalisme, contrôle d'images.
- Modalités : texte et image en entrée ; image et texte en sortie.
- Résolutions annoncées sur la fiche : 1K, 2K et 4K.
- Jusqu'à 14 images de référence mentionnées dans la fiche tarifaire consultée.
- Ratios étendus via `image_config`.
- Prix de fiche : $1.50/M entrée et $30/M sortie ; fournisseur Google AI Studio affiché avec prix image output $30/M.
- Recommandation : candidat premium/édition, à sélectionner après test réel de qualité et de coût.

### Nano Banana Pro

Slug : `google/gemini-3-pro-image`.

- Positionnement : compositions complexes, texte lisible, graphismes, visualisations, production professionnelle.
- Modalités : image et texte en entrée ; image et texte en sortie.
- Jusqu'à 14 références selon la fiche consultée.
- Résolutions 2K/4K et ratios flexibles décrits dans la collection OpenRouter.
- Prix de fiche : $2/M entrée, $12/M sortie texte, $120/M image output.
- Fournisseurs indiqués : Google AI Studio et Google Vertex dans la fiche consultée.
- Recommandation : option premium pour compositions complexes, pas le défaut de chaque demande en raison du coût.

## 3. API Images vs Chat Completions

### 3.1 API Images — recommandée

Endpoint :

`POST https://openrouter.ai/api/v1/images`

Authentification serveur :

`Authorization: Bearer $OPENROUTER_API_KEY`

Corps minimal documenté :

```json
{
  "model": "google/gemini-3.1-flash-image",
  "prompt": "Illustration pédagogique d'un réseau neuronal..."
}
```

Pour ratios/résolution, la documentation générale montre les champs `aspect_ratio` et `resolution`, tandis que les fiches Nano Banana indiquent un contrôle via `image_config`. Le format final exact doit donc être déterminé par le endpoint/provider et son `supported_parameters`, et non supposé identique pour tous les modèles.

Réponse standard documentée :

```json
{
  "created": 1748372400,
  "data": [
    {
      "b64_json": "<base64-encoded-image>",
      "media_type": "image/png"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 4175,
    "total_tokens": 4175,
    "cost": 0.04
  }
}
```

L'API Images est la plus naturelle pour un service dont la sortie principale est un fichier image. Elle fournit un tableau de fichiers base64, le type MIME et l'usage lorsque disponible.

### 3.2 Découverte des capacités

Avant d'exposer un modèle, appeler :

- `GET https://openrouter.ai/api/v1/images/models`
- `GET https://openrouter.ai/api/v1/images/models/{author}/{slug}/endpoints`

Le catalogue général `GET /api/v1/models?output_modalities=image` est utile pour une première découverte, mais l'API Images expose les paramètres de génération dédiés.

Le record par endpoint expose notamment :
- `provider_slug` / `provider_tag` ;
- `supported_parameters` ;
- `allowed_passthrough_parameters` ;
- `supports_streaming` ;
- lignes `pricing` avec `billable`, `unit`, `cost_usd`, et parfois `variant`.

La capacité du modèle est l'union de plusieurs providers ; la capacité du endpoint choisi est plus restrictive. La validation UI/backend doit utiliser la seconde.

### 3.3 Chat Completions multimodales — alternative

Endpoint :

`POST https://openrouter.ai/api/v1/chat/completions`

Les pages modèles Nano Banana indiquent la possibilité de demander des sorties multimodales avec `modalities: ["image", "text"]`. La réponse image est alors incluse dans le message assistant sous forme de contenu multimodal/base64 data URL selon le format du modèle.

Cette voie est utile pour des échanges multimodaux multi-tours ou quand un modèle est disponible via Chat Completions mais pas via Images API. Elle est moins adaptée comme contrat principal d'un service de fichiers, car le parseur doit inspecter les parties du message au lieu de recevoir directement `data[].b64_json`.

Le client worker actuel `apps/worker/src/ai/llm.ts` n'est pas compatible tel quel : il suppose `choices[0].message.content` string.

## 4. Images de référence et édition

L'API Images documente le champ `input_references` :

```json
{
  "model": "google/gemini-3.1-flash-image",
  "prompt": "Conserve la composition et remplace le fond par un décor de studio clair.",
  "input_references": [
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/reference.png"
      }
    }
  ]
}
```

Les références peuvent être une URL HTTP(S) ou une data URL base64. Le nombre accepté dépend du fournisseur. Pour des assets privés Leanna, préférer une URL signée de courte durée générée par le serveur ou un data URL après lecture autorisée depuis Storage. Ne pas accepter une URL arbitraire côté serveur sans protection SSRF.

Les pages Nano Banana 2.1 et Pro consultées indiquent jusqu'à 14 références pour les workflows d'édition. Ce plafond n'est pas une garantie universelle pour tous les endpoints ; vérifier les capacités réelles et limites de taille.

Pour les éditions successives, renvoyer l'image précédente comme référence et transmettre une instruction précise. Chaque édition doit produire une nouvelle version en base de données.

## 5. Résolution, ratio, variantes et formats

La documentation Image API décrit des champs génériques :
- `resolution` : tiers normalisés, par exemple 512, 768, 1K, 1.5K, 2K, 4K ;
- `aspect_ratio` : ratios usuels et étendus, selon provider ;
- `size` : raccourci tier ou pixels explicites si supportés ;
- `n` : jusqu'à 10 images dans l'API, mais tous les endpoints ne supportent pas plusieurs sorties ;
- `output_format` : PNG/JPEG/WebP/SVG/GIF selon modèles/providers, pas une promesse universelle ;
- `quality`, `background`, `seed`, `output_compression` : seulement si supportés.

Les fiches Nano Banana indiquent des contrôles `image_config` spécifiques. La documentation doit donc être traitée comme une source de capacités à découvrir au runtime, pas comme une liste de champs à envoyer aveuglément. Un prompt négatif n'est pas confirmé dans les capacités consultées ; ne pas le présenter comme option Nano Banana standard.

## 6. Streaming et délais

L'API Images supporte le streaming uniquement si `supports_streaming: true` sur le endpoint choisi. Les événements documentés comprennent :
- `image_generation.partial_image` ;
- `image_generation.completed` ;
- `error` ;
- `[DONE]`.

Les previews partielles ne doivent pas être sauvegardées comme version finale. Le Studio peut conserver une progression de job simple si le endpoint n'expose pas de streaming.

## 7. Facturation OpenRouter

La réponse Image API peut inclure `usage.cost` en USD. Les enregistrements d'endpoint décrivent les unités de facturation : image, mégapixel ou token, avec variantes de résolution éventuelles.

La documentation OpenRouter précise que la génération image est all-or-nothing : une génération complétée est facturée ; une génération échouée/annulée avant complétion ne l'est pas. Nuance : si le client se déconnecte, le fournisseur peut continuer et terminer le rendu ; l'appelant doit donc traiter les timeouts comme des résultats potentiellement ambigus jusqu'à réconciliation.

Pour Leanna :
- stocker `usage.cost` quand présent ;
- stocker le payload usage et l'ID modèle/provider ;
- ne pas estimer le coût final à partir d'un tarif public si OpenRouter renvoie le coût réel ;
- ne pas confondre coût USD OpenRouter et crédits internes facturés au membre.

## 8. Sélection recommandée

| Besoin | Modèle |
|---|---|
| Défaut text-to-image / rapidité | Nano Banana 2 |
| Retouche et édition de référence avancées | Nano Banana 2.1 |
| Composition complexe, texte intégré, qualité premium | Nano Banana Pro |

**Choix de départ :** Nano Banana 2 (`google/gemini-3.1-flash-image`) comme défaut, Nano Banana Pro (`google/gemini-3-pro-image`) comme option premium. Nano Banana 2.1 mérite un benchmark comparatif avant décision définitive, notamment son coût effectif par image et la qualité des retouches.

## 9. Sources officielles consultées

- [OpenRouter — Image Generation documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter — Image Models collection](https://openrouter.ai/collections/image-models)
- [Nano Banana 2 — model page](https://openrouter.ai/google/gemini-3.1-flash-image)
- [Nano Banana 2.1 — model page](https://openrouter.ai/google/gemini-nano-banana-2.1)
- [Nano Banana Pro — model page](https://openrouter.ai/google/gemini-3-pro-image)
- [OpenRouter — Nano Banana editing guide](https://openrouter.ai/blog/tutorials/nano-banana/)
- [OpenRouter — Chat Completions API reference](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

**À revalider avant implémentation :** la présence de chaque slug dans `/images/models`, la réponse de `/endpoints`, les paramètres `image_config` réellement transmis par provider, les tarifs effectifs et le nombre de références autorisé sur l'endpoint retenu.
