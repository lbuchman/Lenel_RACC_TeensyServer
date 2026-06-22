# f2fSimPanel



cmake -DCMAKE_TOOLCHAIN_FILE=../cross/arm-teensy41-gnueabihf.cmake  -DCMAKE_BUILD_TYPE=Release ../

https://www.pololu.com/product/1182

bdtf help pi41t 2>/dev/null  | python -m json.tool

make sure to rebuild the teensy libs with the script buildLib

To program firmware  by test fixture pi do setup below:



1. get from pi rsa kay
2. add to .ssh/config record

Host pia 
   User pi 
   HostName pia 
   IdentityFile ~/.ssh/piA.key 
   ForwardX11 yes 
   Compression yes

3. make the file in the f2fSimPanel/teensy/ directory

   echo "pia" > testfixturePi

   

