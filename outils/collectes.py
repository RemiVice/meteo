# Lit le calendrier des collectes de la Ville de Montmagny et met à jour collectes.json
# (lancé chaque jour par le robot GitHub ; garde aussi les dates déjà connues)
import json, os, re, urllib.request

ADRESSE = "https://www.ville.montmagny.qc.ca/fr/calendrier/affiche/?type=12"
FICHIER = os.path.join(os.path.dirname(__file__), "..", "collectes.json")

requete = urllib.request.Request(ADRESSE, headers={"User-Agent": "Mozilla/5.0 (meteo-remivice)"})
page = urllib.request.urlopen(requete, timeout=30).read().decode("utf-8", "replace")
nouvelles = set(m.group(1) for m in re.finditer(r"/fr/calendrier/(\d{4}/\d{2}/\d{2}/[a-z0-9-]+)/", page))

anciennes = set()
if os.path.exists(FICHIER):
    anciennes = set(json.load(open(FICHIER, encoding="utf-8")))
tout = sorted(anciennes | nouvelles)[-400:]   # environ un an
json.dump(tout, open(FICHIER, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(nouvelles), "nouvelles lignes,", len(tout), "au total")
