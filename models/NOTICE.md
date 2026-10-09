# Model notice

`birdnet_v2.4_*` files are the BirdNET V2.4 model, label list and species-occurrence (meta) model.

- Source: BirdNET-Analyzer, https://github.com/birdnet-team/BirdNET-Analyzer (official download, V2.4)
- Authors: K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, and Chemnitz University of Technology
- License of the models: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0)

Use is limited to non-commercial research and education. Any commercial use needs separate permission from the authors.
BirdNET does not contain every species of the reserve (for example Pelecanus crispus is absent), so human verification stays in the loop.


## WetlandEar species classifier (`head.npz`)
A small classifier trained by WetlandEar on BirdNET sound fingerprints of about 1,700 Xeno-canto recordings of 125 species of Kazakhstan wetlands and steppe (list: `head_training_sources.csv`, one Xeno-canto id per recording), fused with BirdNET's own scores and calibrated.
Recordings are used under their Creative Commons licenses (recordings licensed No-Derivatives were excluded); credit goes to the recordists on xeno-canto.org. Use is non-commercial research and education.
Measured on recordings it had not seen (cross-validation by recording, 123 species with at least 4 recordings): 74.4% of 3-second fragments correct against 59.5% for BirdNET alone on the same fragments; 82.6% when the fragments of one recording are averaged.
Confidence is calibrated: at 0.5 and above about 93% of suggestions are right (covering 68% of fragments); the app fills a species in automatically only from 0.5.
Species with few training recordings are included but less reliable; Pelecanus crispus has no training data yet.
