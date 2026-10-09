# Model notice

`birdnet_v2.4_*` files are the BirdNET V2.4 model, label list and species-occurrence (meta) model.

- Source: BirdNET-Analyzer, https://github.com/birdnet-team/BirdNET-Analyzer (official download, V2.4)
- Authors: K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, and Chemnitz University of Technology
- License of the models: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0)

Use is limited to non-commercial research and education. Any commercial use needs separate permission from the authors.
BirdNET does not contain every species of the reserve (for example Pelecanus crispus is absent), so human verification stays in the loop.


## WetlandEar species classifier (`head.npz`)
A small classifier trained by WetlandEar on BirdNET sound fingerprints of Xeno-canto recordings (list: `head_training_sources.csv`, one Xeno-canto id per recording).
Recordings are used under their Creative Commons licenses (recordings licensed No-Derivatives were excluded); credit goes to the recordists on xeno-canto.org. Use is non-commercial research and education.
Measured on recordings it had not seen (cross-validation by recording, 24 species): 78 to 81% of fragments correct, against 69% for BirdNET alone. Confidence is calibrated: at 0.35 and above about 98% correct for known species.
Species with a single training recording (for example Pelecanus crispus) are included but cannot be validated yet.
