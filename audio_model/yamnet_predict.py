import os
import numpy as np
import tensorflow as tf
import tensorflow_hub as hub
import soundfile as sf
import logging
from typing import Dict, List, Tuple, Union, Any, Optional, Set

class YAMNetPredictor:
    # Define audio classes that are considered threats
    THREAT_CLASSES: Set[str] = {
        'Gunshot, gunfire', 'Explosion', 'Chainsaw', 'Vehicle', 'Engine', 'Motorboat, speedboat',
        'Helicopter', 'Truck', 'Screaming', 'Emergency vehicle', 'Siren', 'Fire alarm',
        'Civil defense siren', 'Mechanical saw', 'Tools', 'Construction'
    }
    
    # Define threat confidence threshold
    THREAT_THRESHOLD: float = 0.40
    
    def __init__(self, model_path: str = "https://tfhub.dev/google/yamnet/1"):
        """Initialize the YAMNet audio classifier.
        
        Args:
            model_path: Path or URL to the YAMNet model
        """
        # Configure logging
        self.logger = logging.getLogger(__name__)
        # Load the model
        self.model = hub.load(model_path)
        
        # Load class names
        class_map_path = tf.keras.utils.get_file(
            'yamnet_class_map.csv',
            'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv')
        self.class_names = []
        with open(class_map_path) as f:
            for row in f:
                # Skip the header and blank lines
                if not row.startswith('#') and row.strip():
                    row = row.strip().split(',')
                    if len(row) >= 2:
                        self.class_names.append(row[2])
    
    def predict(self, audio_path: Union[str, os.PathLike], top_k: int = 5) -> List[Dict[str, Any]]:
        """Analyze audio using YAMNet and return predictions.
        
        Args:
            audio_path: Path to the audio file (.wav format)
            top_k: Number of top predictions to return
            
        Returns:
            List of dictionaries with audio classification results
        """
        try:
            # Load the audio file
            wav_data, sample_rate = sf.read(audio_path)
            
            # Make sure the audio is mono
            if len(wav_data.shape) > 1:
                wav_data = np.mean(wav_data, axis=1)
            
            # Ensure correct sample rate (YAMNet expects 16kHz)
            if sample_rate != 16000:
                print(f"Warning: Sample rate is {sample_rate}Hz, YAMNet expects 16kHz. Results may be affected.")
            
            # Get model prediction
            scores, embeddings, spectrogram = self.model(wav_data)
            scores = scores.numpy()
            
            # Compute the average scores across frames
            mean_scores = np.mean(scores, axis=0)
            
            # Get the top k results
            top_indices = np.argsort(mean_scores)[-top_k:][::-1]
              # Format the results
            results = []
            for i in top_indices:
                class_name = self.class_names[i]
                confidence = float(round(mean_scores[i], 3))
                
                # Determine if this is a potential threat
                is_threat = (
                    class_name in self.THREAT_CLASSES and 
                    confidence >= self.THREAT_THRESHOLD
                )
                
                # Log threats
                if is_threat:
                    self.logger.warning(f"Potential audio threat detected: {class_name} with {confidence:.2f} confidence")
                
                results.append({
                    "class_name": class_name,
                    "confidence": confidence,
                    "is_threat": is_threat
                })
            
            return results
        
        except Exception as e:
            print(f"Error processing audio: {e}")
            return [{"class": "error", "confidence": 0.0, "error": str(e)}]
    
    @staticmethod
    def cleanup_file(file_path: Union[str, os.PathLike]) -> None:
        """Remove the file after prediction.
        
        Args:
            file_path: Path to the file that needs to be deleted
        """
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted temporary file: {file_path}")


# For testing purposes
if __name__ == "__main__":
    predictor = YAMNetPredictor()
    
    # Test with a sample audio file
    test_audio = "path_to_your_test_audio.wav"
    if os.path.exists(test_audio):
        results = predictor.predict(test_audio)
        print(f"Audio classification results: {results}")
    else:
        print(f"Test audio not found: {test_audio}")
