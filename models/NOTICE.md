# Model notice

`birdnet_v2.4_*` files are the BirdNET V2.4 model, label list and species-occurrence (meta) model.

- Source: BirdNET-Analyzer, https://github.com/birdnet-team/BirdNET-Analyzer (official download, V2.4)
- Authors: K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, and Chemnitz University of Technology
- License of the models: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0)

Use is limited to non-commercial research and education. Any commercial use needs separate permission from the authors.
BirdNET does not contain every species of the reserve (for example Pelecanus crispus is absent), so human verification stays in the loop.


## WetlandEar species classifier (`head.npz`, version 6)
A small classifier trained by WetlandEar on BirdNET sound fingerprints of about 9,800 recordings of 270 species of Kazakhstan wetlands and steppe: 7,795 from Xeno-canto (list: `head_training_sources.csv`, one Xeno-canto id per recording) and 2,042 from iNaturalist (list: `head_training_sources_inat.csv`). It is fused with BirdNET's own scores and calibrated. It is also trained on noisy copies of the recordings (reed rustle, wind, water, rain, field background, other birds singing) so that it keeps working in dirty sound.
Recordings are used under their Creative Commons licenses (Xeno-canto recordings licensed No-Derivatives were excluded; iNaturalist sounds are only those licensed CC0, CC BY or CC BY-SA); credit goes to the recordists on xeno-canto.org and the observers on inaturalist.org. Use is non-commercial research and education.
Measured on recordings it had not seen (cross-validation by recording), against BirdNET's own scores restricted to the same species list and without any location filter: on Xeno-canto recordings 73.6% of 3-second fragments correct against 61.1%; on iNaturalist recordings (more field-like) 56.8% against 41.4% (47.1% for the same classifier trained without iNaturalist); over everything 70.5% against 57.5%; 82.5% when the fragments of one recording are averaged. On the same fragments mixed with noise: 61.5% against 45.9% (the noise is simulated). Earlier versions compared themselves with a lower BirdNET number that was affected by a location filter; see the report in the wetlandear-ml repository. Details per species: https://wetlandear.tech/metrics
Confidence is calibrated: at 0.5 and above about 91% of suggestions are right on clean recordings and the app fills a species in automatically only from 0.5.
Species with few training recordings are included but less reliable (for example Dalmatian Pelican, Great White Pelican, Egyptian Vulture, Lanner Falcon); Pelecanus crispus has only 2 recordings and is not yet recognised.
