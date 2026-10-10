# Model notice

`birdnet_v2.4_*` files are the BirdNET V2.4 model, label list and species-occurrence (meta) model.

- Source: BirdNET-Analyzer, https://github.com/birdnet-team/BirdNET-Analyzer (official download, V2.4)
- Authors: K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, and Chemnitz University of Technology
- License of the models: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0)

Use is limited to non-commercial research and education. Any commercial use needs separate permission from the authors.
BirdNET does not contain every species of the reserve (for example Pelecanus crispus is absent), so human verification stays in the loop.


## WetlandEar species classifier (`head.npz`, version 5)
A small classifier trained by WetlandEar on BirdNET sound fingerprints of about 7,800 Xeno-canto recordings of 268 species of Kazakhstan wetlands and steppe (list: `head_training_sources.csv`, one Xeno-canto id per recording), fused with BirdNET's own scores and calibrated. It is also trained on noisy copies of the recordings (reed rustle, wind, water, rain, field background, other birds singing) so that it keeps working in dirty sound.
Recordings are used under their Creative Commons licenses (recordings licensed No-Derivatives were excluded); credit goes to the recordists on xeno-canto.org. Use is non-commercial research and education.
Measured on recordings it had not seen (cross-validation by recording): 74.2% of 3-second fragments correct against 56.3% for BirdNET alone on the same fragments; 85.0% when the fragments of one recording are averaged. On the same fragments mixed with noise: 67.5% against 51.0% for BirdNET restricted to the same species list (the noise is simulated). Details per species: https://wetlandear.tech/metrics
Confidence is calibrated: at 0.5 and above about 91% of suggestions are right on clean recordings (covering 71% of fragments) and about 87% on noisy ones; the app fills a species in automatically only from 0.5.
Species with few training recordings are included but less reliable (for example Dalmatian Pelican, Great White Pelican, Egyptian Vulture, Lanner Falcon); Pelecanus crispus has only 2 recordings and is not yet recognised.
