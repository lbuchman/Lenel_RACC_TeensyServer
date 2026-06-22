#ifndef HW_CONFIG_H
#define HW_CONFIG_H

//Reader 1
#define READER1_F2F_O 4
#define READER1_F2F_I 2
#define READER1_D1 10
#define READER1_LEDGreen 11
#define READER1_LEDRed 3
#define READER1_LEDRed1k 6
#define READER1_LEDRed2k 26
#define READER1_Buz 5
#define READER1_Buz1K 27
#define READER1_Buz2K 25
#define READER1_Tamp 24
#define READER1osdpPort Serial2
#define READER1osdpFlowCnt 9
#define READER1_D0 READER1_F2F_I
#define READER1_Power 30

//Reader2
#define READER2_F2F_O 38
#define READER2_F2F_I 19
#define READER2_D1 14
#define READER2_LEDGreen 36
#define READER2_LEDRed 39
#define READER2_LEDRed1k 23
#define READER2_LEDRed2k 34
#define READER2_Buz 37
#define READER2_Buz1K 22
#define READER2_Buz2K 35
#define READER2_Tamp 21
#define READER2osdpPort Serial4
#define READER2osdpFlowCnt 15
#define READER2_D0 READER2_F2F_I
#define READER2_Power 18

#define MOTOR_STEP 31
#define MOTOR_DIR 32
#define MOTOR_EN 33

#define HALL_SENSOR 41

#endif
