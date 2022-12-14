
import React, { useState, useEffect } from 'react';

//react native
import { ActivityIndicator, Text, View, ScrollView, StyleSheet, Button, Platform, TextInput } from 'react-native';

//picker
import RNPickerSelect from 'react-native-picker-select';
import { Chevron } from 'react-native-shapes';

//Expo
import Constants from 'expo-constants';
import * as Permissions from 'expo-permissions';
import { Camera } from 'expo-camera';

//Tensorflow
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import {cameraWithTensors} from '@tensorflow/tfjs-react-native';

//disable yellow warnings on EXPO client!
console.disableYellowBox = true;

export default function App() {


//create variables for processing
  const [word, setWord] = useState('');
  const [guess, setGuess] = useState("");
  const [translation, setTranslation] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [language, setLanguage] =  useState('hi');
  const [translationAvailable, setTranslationAvailable] = useState(true);
  const [predictionFound, setPredictionFound] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);

  //Tensorflow and Permissions
  const [mobilenetModel, setMobilenetModel] = useState(null);
  const [frameworkReady, setFrameworkReady] = useState(false);

  //defaults


  const availableLanguages = [

    //add all common languages

    { label: 'Hindi', value: 'hi' },
    {label: 'Spanish', value: 'es'},
    {label: 'French', value: 'fr'},
    {label: 'German', value: 'de'},
    {label: 'Italian', value: 'it'},
    {label: 'Dutch', value: 'nl'},
    {label: 'Portuguese', value: 'pt'},
    {label: 'Russian', value: 'ru'},
    {label: 'Arabic', value: 'ar'},
    {label: 'Hebrew', value: 'he'},
    { label: 'Mandarin Chinese', value: 'zh' }
  ];
  const GoogleTranslateAPI = "https://translation.googleapis.com/language/translate/v2";
  const GoogleAPIKey = "AIzaSyCr3SYaVMZip5wIjUQ_-y_AAvBquNbAgqU";

  //TF Camera Decorator
  const TensorCamera = cameraWithTensors(Camera);

  //RAF ID
  let requestAnimationFrameId = 0;

  //performance hacks (Platform dependent)
  const textureDims = Platform.OS === "ios"? { width: 1080, height: 1920 } : { width: 1600, height: 1200 };
  const tensorDims = { width: 152, height: 200 }; 

  //-----------------------------
  // Run effect once
  // 1. Check camera permissions
  // 2. Initialize TensorFlow
  // 3. Load Mobilenet Model
  //-----------------------------
  useEffect(() => {
    if(!frameworkReady) {
      (async () => {

        //check permissions
        const { status } = await Camera.requestPermissionsAsync();
        console.log(`permissions status: ${status}`);
        setHasPermission(status === 'granted');

        //we must always wait for the Tensorflow API to be ready before any TF operation...
        await tf.ready();

        //load the mobilenet model and save it in state
        setMobilenetModel(await loadMobileNetModel());

        setFrameworkReady(true);
      })();
    }
  }, []);

  //--------------------------
  // Run onUnmount routine
  // for cancelling animation 
  // if running to avoid leaks
  //--------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(requestAnimationFrameId);
    };
  }, [requestAnimationFrameId]);

  //--------------------------------------------------------------
  // Helper asynchronous function to invoke the Google Translation
  // API and fetch the translated text. Excellent documentation
  // for parameters and response data structure is here 
  // (Translating text (Basic)):
  // https://cloud.google.com/translate/docs/basic/quickstart
  //
  // NOTE: Here we are using the simple GET with key model. While
  // this is simple to implement, it is recommended to do a POST
  // with an OAuth key to avoid key tampering. This approach is
  // for instructional purposes ONLY.
  //---------------------------------------------------------------
  const getTranslation = async (className) => {
    try {
      const googleTranslateApiEndpoint = `${GoogleTranslateAPI}?q=${className}&target=${language}&format=html&source=en&model=nmt&key=${GoogleAPIKey}`;
      console.log(`Attempting to hit Google API Endpoint: ${googleTranslateApiEndpoint}`);
      
      const apiCall = await fetch(googleTranslateApiEndpoint);
      if(!apiCall){ 
        console.error(`Google API did not respond adequately. Review API call.`);
        //throw new Error(`Google API did not respond.`);
        setTranslation(`Cannot get transaction at this time. Please try again later`);
      }

      //get JSON data
      let response = await apiCall.json();
      if(!response.data || !response.data.translations || response.data.translations.length === 0){ 
        console.error(`Google API unexpected response. ${response}`);
        //throw new Error(`Google API responded with invalid data.`);
        setTranslation(`Cannot get transaction at this time. Please try again later`);
      }

      // we only care about the first occurrence
      console.log(`Translated text is: ${response.data.translations[0].translatedText}`);
      setTranslation(response.data.translations[0].translatedText);
      setPronunciation(response.data.translations[0].translatedText.pronunciation);
      setWord(className);
    } catch (error) {
      console.error(`Error while attempting to get translation from Google API. Error: ${error}`);
      setTranslation(`Cannot get transaction at this time. Please try again later`);
    } 

    setTranslationAvailable(true);
  }

  //-----------------------------------------------------------------
  // Loads the mobilenet Tensorflow model: 
  // https://github.com/tensorflow/tfjs-models/tree/master/mobilenet
  //-----------------------------------------------------------------
  const loadMobileNetModel = async () => {
    const model = await mobilenet.load();
    return model;
  }


  //----------------------------------------------------------------------------------------
  // MobileNet tensorflow model classify operation returns an array of prediction objects 
  // with this structure: prediction = [ {"className": "object name", "probability": 0-1 } ]
  // where:
  // className = The class of the object being identified. Currently, this model identifies 1000 different classes.
  // probability = Number between 0 and 1 that represents the prediction's probability 
  // Example (with a topk parameter set to 3 => default):
  // [
  //   {"className":"joystick","probability":0.8070220947265625},
  //   {"className":"screen, CRT screen","probability":0.06108357384800911},
  //   {"className":"monitor","probability":0.04016926884651184}
  // ]
  // In this case, we use topk set to 1 as we are interested in the higest result for
  // both performance and simplicity. This means the array will return 1 prediction only!
  //----------------------------------------------------------------------------------------
  const getPrediction = async(tensor) => {
    if(!tensor) { return; }

    //topk set to 1
    const prediction = await mobilenetModel.classify(tensor, 1);
    console.log(`prediction: ${JSON.stringify(prediction)}`);

    if(!prediction || prediction.length === 0) { return; }
    
    //only attempt translation when confidence is higher than 70%
    if(prediction[0].probability > 0.7) {

      //stop looping!
      cancelAnimationFrame(requestAnimationFrameId);
      setPredictionFound(true);

      //get translation!
      await getTranslation(prediction[0].className.split(',')[0]);
    }
  }

  //------------------------------------------------------------------------------
  //handles the camera tensor streams
  //------------------------------------------------------------------------------
  const handleCameraStream = (imageAsTensors) => {
    const loop = async () => {
      const nextImageTensor = await imageAsTensors.next().value;
      await getPrediction(nextImageTensor);
      requestAnimationFrameId = requestAnimationFrame(loop);
    };
    if(!predictionFound) loop();
  }

  //------------------------------------------------------
  // Helper function to reset all required state variables 
  // to start a fresh new translation routine! 
  //------------------------------------------------------
  const loadNewTranslation = () => {
    setTranslation('');
    setWord('');
    setPredictionFound(false);
    setTranslationAvailable(false);
  }

  //------------------------------------------------------
  // Helper function to render the language picker
  //------------------------------------------------------
  const showLanguageDropdown = () => {
    return  <View>
              <RNPickerSelect
                placeholder={{}}
                onValueChange={(value) => setLanguage(value)}
                items={availableLanguages} 
                value={language}
                style={pickerSelectStyles}
                useNativeAndroidPickerStyle={false}
                Icon={() => {
                  return <Chevron style={{marginTop: 20, marginRight: 15}} size={1.5} color="gray" />;
                }}
              />
                
            </View>  
  }

  //----------------------------------------------
  // Helper function to show the Translation View. 
  //----------------------------------------------
  const showTranslationView = () => { 
    return  <View style={styles.translationView}>
              {
                translationAvailable ?
                  <View>
                    <ScrollView style={{height:400}}>
                      <Text style={styles.translationTextField}>{translation}</Text>
                      <Text style={styles.wordTextField}>{word}</Text>
                      

                      <TextInput
                        style={styles.wordTextField}
                        onChangeText={guess => setGuess(guess)}
                        value={guess}
                        placeholder="Guess the word..."
                        placeholderTextColor="gray"
                      />
                    <View style={styles.guessButtonView}>
                      <Button 
                        title="Guess" 
                        onPress={ () => {
                          if(guess.toLowerCase() === word.toLowerCase()) {
                            setGuess(`Correct!`);
                          } else {
                            setGuess(`Incorrect. Try again!`);
                          }
                        }} 
                      />
                    </View>
                 


                      
                    </ScrollView>
                    <Button color='#9400D3' title="Check new word" onPress={() => loadNewTranslation()}/>
                  </View>
                : <ActivityIndicator size="large"/>
              }
            </View>
  }

  
  //--------------------------------------------------------------------------------
  // Helper function to show the Camera View. 
  //--------------------------------------------------------------------------------
  const renderCameraView = () => {
    return <View style={styles.cameraView}>
                <TensorCamera
                  style={styles.camera}
                  type={Camera.Constants.Type.back}
                  zoom={0}
                  cameraTextureHeight={textureDims.height}
                  cameraTextureWidth={textureDims.width}
                  resizeHeight={tensorDims.height}
                  resizeWidth={tensorDims.width}
                  resizeDepth={3}
                  onReady={(imageAsTensors) => handleCameraStream(imageAsTensors)}
                  autorender={true}
                />
                <Text style={styles.legendTextField}>Point to any object and get its {availableLanguages.find(al => al.value === language).label } translation</Text>
            </View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Akhil's Translator
        </Text>
      </View>

      <View style={styles.body}>
        { showLanguageDropdown() }
        {translationAvailable ? showTranslationView() : renderCameraView() }
      </View>  
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: Constants.statusBarHeight,
    backgroundColor: '#E8E8E8',
  },
  header: {
    backgroundColor: '#065693'
  },
  title: {
    margin: 10,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#ffffff'
  },
  body: {
    padding: 5,
    paddingTop: 25
  },
  cameraView: {
    display: 'flex',
    flex:1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    width: '100%',
    height: '100%',
    paddingTop: 10
  },
  camera : {
    width: 700/2,
    height: 800/2,
    zIndex: 1,
    borderWidth: 0,
    borderRadius: 0,
  },
  translationView: {
    marginTop: 30, 
    padding: 20,
    borderColor: '#cccccc',
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    height: 500
  },
  translationTextField: {
    fontSize:60
  },
  wordTextField: {
    textAlign:'right', 
    fontSize:20, 
    marginBottom: 50
  },
  legendTextField: {
    fontStyle: 'italic',
    color: '#888888'
  },
  inputAndroid: {
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'purple',
    borderStyle: 'solid',
    borderRadius: 8,
    color: 'black',
    paddingRight: 30,
    backgroundColor: '#ffffff'
  },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 4,
    color: 'black',
    paddingRight: 30
  },
  inputAndroid: {
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: 'grey',
    borderRadius: 3,
    color: 'black',
    paddingRight: 30,
    backgroundColor: '#cccccc'
  },
});